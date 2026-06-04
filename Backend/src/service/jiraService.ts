import axios from "axios";
import { Epic, Project } from "../interface/interface";
import logger from "../utils/logger";

const CACHE_TTL = 5 * 60 * 1000;
const makeHeaders = (auth: string) => ({ Authorization: `Basic ${auth}`, Accept: "application/json" });

// Retry on 429/503 — waits for Retry-After header then falls back to exponential backoff
const retryWithBackoff = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      if (attempt === retries) throw err;
      const status = err?.response?.status;
      if (status === 429 || status === 503) {
        const retryAfter = parseInt(err?.response?.headers?.["retry-after"] ?? "0", 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** attempt, 30000);
        logger.warn("Jira rate limit hit, backing off", { status, attempt, waitMs });
        await new Promise(r => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }
  throw new Error("retryWithBackoff: unreachable");
};

const _epicsCache = new Map<string, { data: Epic[]; expiresAt: number }>();

export const loginService = async (email: string, url: string, token: string) => {
  logger.info("loginService: authenticating", { email, url });
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const response = await axios.get(`${url}/rest/api/3/myself`, { headers: makeHeaders(auth) });
  logger.info("loginService: success", { accountId: response.data.accountId });
  return { user: response.data, auth };
};

export const getProjectService = async (url: string, auth: string) => {
  logger.info("getProjectService: fetching projects");
  const { data } = await axios.get(`${url}/rest/api/3/project/search`, { headers: makeHeaders(auth) });
  const projects = (data.values || []).map((p: Project) => ({ name: p.name, key: p.key }));
  logger.info("getProjectService: success", { count: projects.length });
  return projects;
};

export const getBoardService = async (url: string, auth: string, project: string) => {
  logger.info("getBoardService: fetching boards", { project });
  const { data } = await axios.get(`${url}/rest/agile/1.0/board`, {
    params: { projectKeyOrId: project },
    headers: makeHeaders(auth),
  });
  const boards = (data.values || []).map((b: any) => ({
    name: b.name,
    id: b.id,
    projectKey: b.location?.projectKey,
    type: b.type,
  }));
  logger.info("getBoardService: success", { count: boards.length });
  return boards;
};

export const getEpicsFromBoardService = async (url: string, auth: string, boardId: string, dateFrom?: string, dateTo?: string) => {
  logger.info("getEpicsFromBoardService: start", { boardId });
  const cacheKey = `${boardId}|${dateFrom ?? ""}|${dateTo ?? ""}`;
  const cached = _epicsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info("getEpicsFromBoardService: cache hit", { boardId });
    return cached.data;
  }

  const headers = makeHeaders(auth);

  // ── Phase 1: discover epic keys ─────────────────────────────────────────────
  // All three strategies fire in parallel so we never wait for one to fail
  // before starting the next.  Board-info is prefetched here too so Strategy 3
  // can reuse it without an extra round-trip.

  const epicKeys = new Set<string>();

  // Strategy 1 — agile board epic API (parallel pagination: fetch page 1 to get
  // the total, then fire all remaining pages simultaneously)
  const agileEpicPromise = (async (): Promise<Set<string>> => {
    const keys = new Set<string>();
    try {
      const { data: firstPage } = await axios.get(`${url}/rest/agile/1.0/board/${boardId}/epic`, {
        params: { startAt: 0, maxResults: 100 },
        headers,
      });
      const values: any[] = firstPage.values || [];
      for (const val of values) { if (val.key) keys.add(val.key); }

      const total: number = firstPage.total ?? 0;
      if (!firstPage.isLast && total > values.length) {
        const pagePromises: Promise<void>[] = [];
        for (let startAt = values.length; startAt < total; startAt += 100) {
          pagePromises.push(
            retryWithBackoff(() => axios.get(`${url}/rest/agile/1.0/board/${boardId}/epic`, {
              params: { startAt, maxResults: 100 },
              headers,
            })).then(res => {
              for (const val of (res.data.values || [])) { if (val.key) keys.add(val.key); }
            }).catch(() => {}),
          );
        }
        await Promise.all(pagePromises);
      }
    } catch (err: any) {
      logger.warn("getEpicsFromBoardService: agile epic API failed", { boardId, error: err?.message });
    }
    return keys;
  })();

  // Strategy 2 — board issue search (issuetype = Epic)
  const boardIssuePromise = axios
    .get(`${url}/rest/agile/1.0/board/${boardId}/issue`, {
      params: { jql: "issuetype = Epic", maxResults: 100, fields: "key" },
      headers,
    })
    .then((res): Set<string> => {
      const keys = new Set<string>();
      for (const issue of (res.data.issues || [])) { if (issue.key) keys.add(issue.key); }
      return keys;
    })
    .catch((err: any): Set<string> => {
      logger.warn("getEpicsFromBoardService: board issue search failed", { boardId, error: err?.message });
      return new Set();
    });

  // Prefetch board info (needed for Strategy 3 project key)
  const boardInfoPromise = axios
    .get(`${url}/rest/agile/1.0/board/${boardId}`, { headers })
    .then((res) => (res.data?.location?.projectKey as string | null) ?? null)
    .catch((): null => null);

  const [agileKeys, boardKeys, projectKey] = await Promise.all([
    agileEpicPromise,
    boardIssuePromise,
    boardInfoPromise,
  ]);

  for (const k of agileKeys) epicKeys.add(k);
  for (const k of boardKeys) epicKeys.add(k);

  logger.info("getEpicsFromBoardService: parallel discovery done", {
    boardId, agile: agileKeys.size, board: boardKeys.size, merged: epicKeys.size,
  });

  // Strategy 3 — project-level JQL (only if both parallel strategies found nothing)
  if (epicKeys.size === 0 && projectKey) {
    logger.info("getEpicsFromBoardService: falling back to project-level search", { boardId, projectKey });
    try {
      let startAt = 0;
      while (true) {
        const { data } = await axios.get(`${url}/rest/api/3/search/jql`, {
          params: {
            jql: `project = "${projectKey}" AND issuetype = Epic ORDER BY created DESC`,
            maxResults: 100,
            startAt,
            fields: "key",
          },
          headers,
        });
        const issues: any[] = data.issues || [];
        for (const issue of issues) { if (issue.key) epicKeys.add(issue.key); }
        if (issues.length < 100 || epicKeys.size >= (data.total ?? 0)) break;
        startAt += issues.length;
      }
      logger.info("getEpicsFromBoardService: project-level fallback resolved", { boardId, epicCount: epicKeys.size });
    } catch (err: any) {
      logger.error("getEpicsFromBoardService: project-level fallback failed", { error: err?.message });
    }
  }

  logger.info("getEpicsFromBoardService: resolved epic keys", { boardId, epicCount: epicKeys.size });

  const keysArray = [...epicKeys];
  const fetchedEpicDetails: Record<string, any> = {};

  if (keysArray.length > 0) {
    const chunkSize = 100;
    const chunkPromises = [];
    for (let i = 0; i < keysArray.length; i += chunkSize) {
      const chunk = keysArray.slice(i, i + chunkSize);
      const jqlQuery = `key in (${chunk.map(k => `"${k}"`).join(",")})`;
      chunkPromises.push(
        retryWithBackoff(() => axios.get(`${url}/rest/api/3/search/jql`, {
          params: {
            jql: jqlQuery,
            maxResults: chunkSize,
            fields: "summary,status,creator,created",
          },
          headers,
        })).then(res => {
          const issues = res.data.issues || [];
          for (const issue of issues) {
            fetchedEpicDetails[issue.key] = issue;
          }
        }).catch(err => {
          logger.warn("getEpicsFromBoardService: failed to fetch bulk epic details chunk", {
            keys: chunk,
            error: err?.message,
          });
        })
      );
    }
    await Promise.all(chunkPromises);
  }

  const stats: Record<string, { total: number; done: number }> = {};
  for (const k of keysArray) {
    stats[k] = { total: 0, done: 0 };
  }

  if (keysArray.length > 0) {
    // ── Detect whether this project uses "Epic Link" (company-managed) or
    // ── "parent" (team-managed) with a single probe request, then fire ONE
    // ── query per chunk — same request count as before but handles both types.
    let epicLinkField: string = '"Epic Link"';
    try {
      await axios.get(`${url}/rest/api/3/search/jql`, {
        params: { jql: `"Epic Link" = "${keysArray[0]}"`, maxResults: 0, fields: "key" },
        headers,
      });
      // field exists → company-managed
    } catch {
      // field rejected by Jira → team-managed, use parent
      epicLinkField = "parent";
    }

    const chunkSize = 50;
    const statsPromises: Promise<void>[] = [];
    for (let i = 0; i < keysArray.length; i += chunkSize) {
      const chunk = keysArray.slice(i, i + chunkSize);
      const chunkSet = new Set(chunk);
      const chunkKeys = chunk.map(k => `"${k}"`).join(",");

      const processIssues = (issues: any[]) => {
        for (const issue of issues) {
          const f = issue.fields || {};
          const ek: string | null =
            (f.epic?.key && chunkSet.has(f.epic.key) ? f.epic.key : null) ??
            (f.parent?.key && chunkSet.has(f.parent.key) ? f.parent.key : null);
          if (ek && stats[ek]) {
            stats[ek].total++;
            if (f.status?.statusCategory?.key === "done") stats[ek].done++;
          }
        }
      };

      statsPromises.push(
        retryWithBackoff(() => axios.get(`${url}/rest/api/3/search/jql`, {
          params: { jql: `${epicLinkField} in (${chunkKeys})`, maxResults: 1000, fields: "epic,parent,status" },
          headers,
        }))
          .then(res => processIssues(res.data.issues || []))
          .catch(err => {
            logger.warn("getEpicsFromBoardService: stats query failed", { keys: chunk, error: err?.message });
          }),
      );
    }
    await Promise.all(statsPromises);
  }

  const result: Epic[] = keysArray.map((k) => {
    const issue = fetchedEpicDetails[k];
    if (issue) {
      const f = issue.fields || {};
      const s = stats[k];
      const progress = s && s.total > 0
        ? Math.round((s.done / s.total) * 100)
        : (f.status?.statusCategory?.key === "done" ? 100 : 0);

      return {
        key: k,
        name: f.summary || k,
        summary: f.summary || k,
        status: f.status?.name ?? "Unknown",
        progress,
        creator: f.creator?.displayName ?? "Unknown",
        creatorAvatar: f.creator?.avatarUrls?.["24x24"] ?? "",
      };
    } else {
      return {
        key: k,
        name: k,
        summary: k,
        status: "Unknown",
        progress: 0,
        creator: "Unknown",
        creatorAvatar: "",
      };
    }
  });

  // Post-filter by creation date when a range is specified
  const filteredResult = (dateFrom || dateTo) ? result.filter(r => {
    const created = fetchedEpicDetails[r.key]?.fields?.created;
    if (!created) return true;
    const d = new Date(created);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(`${dateTo}T23:59:59.999Z`)) return false;
    return true;
  }) : result;

  logger.info("getEpicsFromBoardService: success", { boardId, epicCount: filteredResult.length });
  _epicsCache.set(cacheKey, { data: filteredResult, expiresAt: Date.now() + CACHE_TTL });
  return filteredResult;
};

export const getEpicDetailsPageService = async (url: string, auth: string, epicKey: string) => {
  logger.info("getEpicDetailsPageService: start", { epicKey });
  const headers = makeHeaders(auth);
  const issueFields = "summary,status,priority,assignee,reporter,issuetype,created,resolutiondate,updated,labels,components,customfield_10016,customfield_10026,customfield_10030";

  // Child issues are linked differently depending on project type: company-managed
  // projects use the "Epic Link" custom field, team-managed projects use "parent".
  // JQL validates every referenced field up front, so a single OR query that names a
  // field the project doesn't have (e.g. "Epic Link" on a team-managed board) fails
  // the whole request. Run each strategy as its own request and merge the survivors.
  const fetchChildIssues = async (): Promise<any[]> => {
    const candidateJqls = [
      `parent = "${epicKey}"`,
      `"Epic Link" = "${epicKey}"`,
    ];
    const results = await Promise.allSettled(
      candidateJqls.map((jql) =>
        axios.get(`${url}/rest/api/3/search/jql`, {
          params: { jql, maxResults: 100, expand: "changelog", fields: issueFields },
          headers,
        })
      )
    );

    const byKey = new Map<string, any>();
    for (const r of results) {
      if (r.status === "fulfilled") {
        for (const issue of (r.value.data.issues || [])) {
          byKey.set(issue.key, issue);
        }
      } else {
        logger.warn("getEpicDetailsPageService: a child-issue query failed (field likely unsupported on this project type)", {
          epicKey,
          error: r.reason?.response?.data?.errorMessages?.[0] ?? r.reason?.message,
        });
      }
    }

    // Fallback: if neither "parent" nor "Epic Link" resolved any children (some
    // instances link epic children through neither field), use the Agile API's
    // epic→issue endpoint, which returns an epic's issues regardless of project
    // type or field naming. Purely additive — only runs when JQL found nothing.
    if (byKey.size === 0) {
      try {
        const { data } = await axios.get(`${url}/rest/agile/1.0/epic/${encodeURIComponent(epicKey)}/issue`, {
          params: { maxResults: 100, expand: "changelog", fields: issueFields },
          headers,
        });
        for (const issue of (data.issues || [])) {
          byKey.set(issue.key, issue);
        }
        logger.info("getEpicDetailsPageService: resolved child issues via Agile epic fallback", { epicKey, count: byKey.size });
      } catch (err: any) {
        logger.warn("getEpicDetailsPageService: Agile epic issue fallback failed", {
          epicKey,
          error: err?.response?.data?.errorMessages?.[0] ?? err?.message,
        });
      }
    }

    return [...byKey.values()];
  };

  // Find epic details in _epicsCache if available
  let cachedEpic: Epic | undefined;
  for (const [, cached] of _epicsCache.entries()) {
    if (cached.expiresAt > Date.now()) {
      const found = cached.data.find((e) => e.key === epicKey);
      if (found) {
        cachedEpic = found;
        break;
      }
    }
  }

  let epicData: any = null;
  let rawIssues: any[];

  if (cachedEpic) {
    logger.info("getEpicDetailsPageService: using cached epic details", { epicKey });
    rawIssues = await fetchChildIssues();
  } else {
    logger.info("getEpicDetailsPageService: fetching epic details from API", { epicKey });
    const [epicResVal, childIssuesVal] = await Promise.all([
      axios.get(`${url}/rest/api/3/issue/${epicKey}`, {
        params: { fields: "summary,status,creator" },
        headers,
      }),
      fetchChildIssues(),
    ]);
    epicData = epicResVal.data;
    rawIssues = childIssuesVal;
  }

  logger.info("getEpicDetailsPageService: fetched issues", { epicKey, issueCount: rawIssues.length });

  const issues = rawIssues.map((issue: any) => {
    const f = issue.fields;

    const changelogList: any[] = [];
    if (issue.changelog?.histories) {
      for (const history of issue.changelog.histories) {
        for (const item of history.items) {
          if (item.field === "status" || item.field === "assignee") {
            changelogList.push({
              author: history.author?.displayName ?? "Unknown",
              field: item.field,
              from: item.fromString ?? "Unassigned",
              to: item.toString ?? "Unassigned",
              created: history.created,
            });
          }
        }
      }
    }

    return {
      key: issue.key,
      summary: f.summary || "",
      status: f.status?.name ?? "Unknown",
      statusCategory: f.status?.statusCategory?.name ?? "To Do",
      priority: f.priority?.name ?? "Medium",
      issueType: f.issuetype?.name ?? "Task",
      assignee: f.assignee ? {
        displayName: f.assignee.displayName,
        avatarUrl: f.assignee.avatarUrls?.["24x24"] ?? "",
      } : null,
      reporter: f.reporter ? {
        displayName: f.reporter.displayName,
      } : null,
      storyPoints: f.customfield_10016 ?? f.customfield_10026 ?? f.customfield_10030 ?? null,
      created: f.created,
      resolutionDate: f.resolutiondate ?? null,
      updated: f.updated,
      labels: f.labels || [],
      components: (f.components || []).map((c: any) => c.name || c),
      changelog: changelogList,
    };
  });

  const childIssues = issues.filter((i: any) => i.key !== epicKey);
  const total = childIssues.length;
  const done = childIssues.filter((i: any) => i.statusCategory === "Done").length;

  let progress = 0;
  if (cachedEpic) {
    progress = total > 0 ? Math.round((done / total) * 100) : cachedEpic.progress;
  } else {
    const isEpicDone = epicData.fields.status?.statusCategory?.key === "done";
    progress = total > 0 ? Math.round((done / total) * 100) : (isEpicDone ? 100 : 0);
  }

  logger.info("getEpicDetailsPageService: success", { epicKey, childIssues: total, done, progress });

  return {
    epic: {
      key: epicKey,
      name: cachedEpic ? cachedEpic.name : (epicData.fields.summary || epicKey),
      summary: cachedEpic ? cachedEpic.summary : (epicData.fields.summary || epicKey),
      status: cachedEpic ? cachedEpic.status : (epicData.fields.status?.name ?? "Unknown"),
      progress,
      creator: cachedEpic ? cachedEpic.creator : (epicData.fields.creator?.displayName ?? "Unknown"),
      creatorAvatar: cachedEpic ? cachedEpic.creatorAvatar : (epicData.fields.creator?.avatarUrls?.["24x24"] ?? ""),
    },
    issues,
  };
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

type DashboardResult = {
  total: number; todo: number; inProgress: number; done: number; openCount: number;
  statusChart: { name: string; count: number; category: string }[];
  statusTableData: { status: string; category: string; count: number; pct: number }[];
  issueTypeData: { name: string; count: number }[];
  priorityData: { name: string; count: number }[];
};

const _dashboardCache = new Map<string, { data: DashboardResult; expiresAt: number }>();

const EMPTY_RESULT: DashboardResult = {
  total: 0, todo: 0, inProgress: 0, done: 0, openCount: 0,
  statusChart: [], statusTableData: [], issueTypeData: [], priorityData: [],
};

export const getDashboardDataService = async (url: string, auth: string, boardId: string, dateFrom?: string, dateTo?: string): Promise<DashboardResult> => {
  const cacheKey = `${boardId}|${dateFrom ?? ""}|${dateTo ?? ""}`;
  const cached = _dashboardCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const headers = makeHeaders(auth);
  const boardIssueUrl = `${url}/rest/agile/1.0/board/${boardId}/issue`;

  const jqlParts: string[] = [];
  if (dateFrom) jqlParts.push(`created >= "${dateFrom}"`);
  if (dateTo) jqlParts.push(`created <= "${dateTo}"`);
  const baseParams: Record<string, any> = { fields: "status,priority,issuetype", maxResults: 100 };
  if (jqlParts.length) baseParams.jql = jqlParts.join(" AND ");

  // Single first call — gets total count and first page
  let firstData: any;
  try {
    const { data } = await axios.get(boardIssueUrl, { params: { ...baseParams, startAt: 0 }, headers });
    firstData = data;
  } catch {
    return EMPTY_RESULT;
  }

  const total: number = firstData.total ?? 0;
  if (total === 0) return EMPTY_RESULT;

  const allIssues: any[] = [...(firstData.issues ?? [])];

  // Fetch remaining pages in parallel (if any)
  if (total > 100) {
    const pageRequests = [];
    for (let startAt = 100; startAt < total; startAt += 100) {
      pageRequests.push(
        retryWithBackoff(() => axios.get(boardIssueUrl, { params: { ...baseParams, startAt }, headers }))
          .then(r => r.data.issues ?? [])
          .catch((): any[] => [])
      );
    }
    const pages = await Promise.all(pageRequests);
    for (const page of pages) allIssues.push(...page);
  }

  logger.info("getDashboardDataService: fetched all issues", { boardId, total: allIssues.length });

  let todo = 0, inProgress = 0, done = 0;
  const statusMap = new Map<string, { count: number; category: string }>();
  const typeMap = new Map<string, number>();
  const priorityMap = new Map<string, number>();

  for (const issue of allIssues) {
    const f = issue.fields ?? {};
    const statusName: string = f.status?.name ?? "Unknown";
    const catKey: string = f.status?.statusCategory?.key ?? "new";
    const catName: string = f.status?.statusCategory?.name ?? "To Do";
    const typeName: string = f.issuetype?.name ?? "Unknown";
    const priorityName: string = f.priority?.name ?? "Medium";

    if (catKey === "new") todo++;
    else if (catKey === "indeterminate") inProgress++;
    else if (catKey === "done") done++;

    const s = statusMap.get(statusName);
    if (s) s.count++; else statusMap.set(statusName, { count: 1, category: catName });

    typeMap.set(typeName, (typeMap.get(typeName) ?? 0) + 1);
    priorityMap.set(priorityName, (priorityMap.get(priorityName) ?? 0) + 1);
  }

  const statusTableData = [...statusMap.entries()]
    .map(([status, { count, category }]) => ({ status, category, count, pct: Math.round((count / total) * 100) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  const result: DashboardResult = {
    total,
    todo,
    inProgress,
    done,
    openCount: todo + inProgress,
    statusChart: statusTableData.slice(0, 12).map(({ status, count, category }) => ({ name: status, count, category })),
    statusTableData,
    issueTypeData: [...typeMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count),
    priorityData: [...priorityMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count),
  };

  _dashboardCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL });
  return result;
};

// ─── Sprint Analysis ─────────────────────────────────────────────────────────

type AssigneeBreakdown = { name: string; avatar: string; count: number; points: number };
type IssueTypeBreakdown = { name: string; count: number };

type SprintAnalysisResult = {
  id: number;
  name: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
  goal: string | null;
  totalIssues: number;
  doneCount: number;
  inProgressCount: number;
  todoCount: number;
  committedPoints: number;
  completedPoints: number;
  completionRate: number;
  assigneeBreakdown: AssigneeBreakdown[];
  issueTypeBreakdown: IssueTypeBreakdown[];
};

type SprintAnalysisResponse = {
  sprints: SprintAnalysisResult[];
  velocityChart: { name: string; committed: number; completed: number }[];
};

const _sprintAnalysisCache = new Map<string, { data: SprintAnalysisResponse; expiresAt: number }>();

export const getSprintAnalysisService = async (
  url: string,
  auth: string,
  boardId: string
): Promise<SprintAnalysisResponse> => {
  logger.info("getSprintAnalysisService: start", { boardId });

  const cached = _sprintAnalysisCache.get(boardId);
  if (cached && cached.expiresAt > Date.now()) {
    logger.info("getSprintAnalysisService: cache hit", { boardId });
    return cached.data;
  }

  const headers = makeHeaders(auth);

  // 1. Fetch all sprints for the board (paginated)
  const allSprints: any[] = [];
  let startAt = 0;
  let isLast = false;

  while (!isLast) {
    try {
      const { data } = await retryWithBackoff(() => axios.get(`${url}/rest/agile/1.0/board/${boardId}/sprint`, {
        params: { startAt, maxResults: 50 },
        headers,
      }));
      const values = data.values || [];
      allSprints.push(...values);
      isLast = data.isLast ?? true;
      startAt += values.length;
      if (values.length === 0) break;
    } catch (err: any) {
      logger.error("getSprintAnalysisService: failed to fetch sprints", {
        boardId,
        error: err?.message,
        status: err?.response?.status,
      });
      break;
    }
  }

  logger.info("getSprintAnalysisService: fetched sprints", { boardId, count: allSprints.length });

  // 2. Separate sprints by state and only fetch full issue details for recent ones
  const activeSprints = allSprints.filter((s: any) => s.state === "active");
  const closedRaw = allSprints
    .filter((s: any) => s.state === "closed")
    .sort((a: any, b: any) => {
      const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
      return bDate - aDate; // newest first
    });
  const futureSprints = allSprints.filter((s: any) => s.state === "future");

  // Only fetch full issue details for the active sprint + the most recent closed
  // sprints. Each sprint costs one (or more) paginated issue request, so capping
  // this is the biggest lever on load time. The velocity chart uses the same set.
  const RECENT_CLOSED_LIMIT = 6;
  const recentClosed = closedRaw.slice(0, RECENT_CLOSED_LIMIT);
  const olderClosed = closedRaw.slice(RECENT_CLOSED_LIMIT);
  const sprintsToFetch = [...activeSprints, ...recentClosed];

  logger.info("getSprintAnalysisService: will fetch issues for sprints", {
    boardId,
    fetchCount: sprintsToFetch.length,
    skipped: olderClosed.length + futureSprints.length,
  });

  const sprintResults: SprintAnalysisResult[] = [];

  const processSprint = async (sprint: any): Promise<SprintAnalysisResult> => {
    const sprintId = sprint.id;
    let issues: any[] = [];

    try {
      // Fetch all issues for this sprint (paginated)
      let issueStartAt = 0;
      let hasMore = true;

      while (hasMore) {
        const { data } = await retryWithBackoff(() => axios.get(`${url}/rest/agile/1.0/sprint/${sprintId}/issue`, {
          params: {
            startAt: issueStartAt,
            maxResults: 100,
            fields: "summary,status,priority,assignee,issuetype,created,resolutiondate,customfield_10016,customfield_10026,customfield_10030",
          },
          headers,
        }));
        const pageIssues = data.issues || [];
        issues.push(...pageIssues);
        issueStartAt += pageIssues.length;
        hasMore = issueStartAt < (data.total || 0);
        if (pageIssues.length === 0) break;
      }
    } catch (err: any) {
      logger.warn("getSprintAnalysisService: failed to fetch sprint issues", {
        sprintId,
        error: err?.message,
      });
    }

    // Compute analytics
    let doneCount = 0;
    let inProgressCount = 0;
    let todoCount = 0;
    let committedPoints = 0;
    let completedPoints = 0;
    const assigneeMap = new Map<string, AssigneeBreakdown>();
    const typeMap = new Map<string, number>();

    for (const issue of issues) {
      const f = issue.fields || {};
      const statusCat = f.status?.statusCategory?.key;
      const points = f.customfield_10016 ?? f.customfield_10026 ?? f.customfield_10030 ?? 0;
      const numPoints = typeof points === "number" ? points : 0;

      committedPoints += numPoints;

      if (statusCat === "done") {
        doneCount++;
        completedPoints += numPoints;
      } else if (statusCat === "indeterminate") {
        inProgressCount++;
      } else {
        todoCount++;
      }

      // Assignee breakdown
      const assigneeName = f.assignee?.displayName ?? "Unassigned";
      const assigneeAvatar = f.assignee?.avatarUrls?.["24x24"] ?? "";
      const existing = assigneeMap.get(assigneeName);
      if (existing) {
        existing.count++;
        existing.points += numPoints;
      } else {
        assigneeMap.set(assigneeName, { name: assigneeName, avatar: assigneeAvatar, count: 1, points: numPoints });
      }

      // Issue type breakdown
      const typeName = f.issuetype?.name ?? "Other";
      typeMap.set(typeName, (typeMap.get(typeName) || 0) + 1);
    }

    const totalIssues = issues.length;
    const completionRate = totalIssues > 0 ? Math.round((doneCount / totalIssues) * 100) : 0;

    return {
      id: sprint.id,
      name: sprint.name || `Sprint ${sprint.id}`,
      state: sprint.state || "unknown",
      startDate: sprint.startDate || null,
      endDate: sprint.endDate || null,
      completeDate: sprint.completeDate || null,
      goal: sprint.goal || null,
      totalIssues,
      doneCount,
      inProgressCount,
      todoCount,
      committedPoints: Math.round(committedPoints * 10) / 10,
      completedPoints: Math.round(completedPoints * 10) / 10,
      completionRate,
      assigneeBreakdown: [...assigneeMap.values()].sort((a, b) => b.points - a.points),
      issueTypeBreakdown: [...typeMap.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    };
  };

  // Build lightweight results for skipped sprints (no issue fetch)
  const makeSkeletonSprint = (sprint: any): SprintAnalysisResult => ({
    id: sprint.id,
    name: sprint.name || `Sprint ${sprint.id}`,
    state: sprint.state || "unknown",
    startDate: sprint.startDate || null,
    endDate: sprint.endDate || null,
    completeDate: sprint.completeDate || null,
    goal: sprint.goal || null,
    totalIssues: 0, doneCount: 0, inProgressCount: 0, todoCount: 0,
    committedPoints: 0, completedPoints: 0, completionRate: 0,
    assigneeBreakdown: [], issueTypeBreakdown: [],
  });

  // Process sprints with full details in chunks of 5
  const chunkSize = 5;
  for (let i = 0; i < sprintsToFetch.length; i += chunkSize) {
    const chunk = sprintsToFetch.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(processSprint));
    sprintResults.push(...results);
  }

  // Add skeleton results for older closed + future sprints
  for (const s of olderClosed) sprintResults.push(makeSkeletonSprint(s));
  for (const s of futureSprints) sprintResults.push(makeSkeletonSprint(s));


  // Sort: active first, then closed (newest first), then future
  const stateOrder: Record<string, number> = { active: 0, closed: 1, future: 2 };
  sprintResults.sort((a, b) => {
    const orderDiff = (stateOrder[a.state] ?? 3) - (stateOrder[b.state] ?? 3);
    if (orderDiff !== 0) return orderDiff;
    // Within same state, sort by start date descending
    const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
    const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
    return bDate - aDate;
  });

  // Build velocity chart from closed sprints (last 10, chronological order)
  const closedSprints = sprintResults
    .filter((s) => s.state === "closed")
    .sort((a, b) => {
      const aDate = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bDate = b.startDate ? new Date(b.startDate).getTime() : 0;
      return aDate - bDate;
    });

  const velocityChart = closedSprints.slice(-RECENT_CLOSED_LIMIT).map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 18) + "…" : s.name,
    committed: s.committedPoints,
    completed: s.completedPoints,
  }));

  const result: SprintAnalysisResponse = { sprints: sprintResults, velocityChart };

  _sprintAnalysisCache.set(boardId, { data: result, expiresAt: Date.now() + CACHE_TTL });
  logger.info("getSprintAnalysisService: success", { boardId, sprintCount: sprintResults.length });

  return result;
};