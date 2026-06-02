import axios from "axios";
import { Epic, Project } from "../interface/interface";
import logger from "../utils/logger";

export const loginService = async (email: string, url: string, token: string) => {
  logger.info("loginService: authenticating", { email, url });
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const response = await axios.get(`${url}/rest/api/3/myself`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  logger.info("loginService: success", { accountId: response.data.accountId });
  return { user: response.data, auth };
};

export const getProjectService = async (url: string, auth: string) => {
  logger.info("getProjectService: fetching projects");
  const { data } = await axios.get(`${url}/rest/api/3/project/search`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  const projects = (data.values || []).map((project: Project) => ({
    name: project.name,
    key: project.key,
  }));
  logger.info("getProjectService: success", { count: projects.length });
  return projects;
};

export const getBoardService = async (url: string, auth: string, project: string) => {
  logger.info("getBoardService: fetching boards", { project });
  const { data } = await axios.get(`${url}/rest/agile/1.0/board`, {
    params: { projectKeyOrId: project },
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  const boards = (data.values || []).map((boards: any) => ({
    name: boards.name,
    id: boards.id,
    projectKey: boards.location?.projectKey,
    type: boards.type,
  }));
  logger.info("getBoardService: success", { count: boards.length });
  return boards;
};

export const getBoardIssuesService = async (url: string, auth: string, boardId: string) => {
  logger.info("getBoardIssuesService: fetching issues", { boardId });
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const baseUrl = `${url}/rest/agile/1.0/board/${boardId}/issue`;
  
  const { data: first } = await axios.get(baseUrl, { params: { startAt: 0, maxResults: 50 }, headers });
  const total = first.total || 0;
  const issues = [...(first.issues || [])];
  
  const promises = [];
  for (let startAt = 50; startAt < total; startAt += 50) {
    promises.push(axios.get(baseUrl, { params: { startAt, maxResults: 50 }, headers }));
  }
  
  const responses = await Promise.all(promises);
  for (const r of responses) {
    issues.push(...(r.data.issues || []));
  }
  logger.info("getBoardIssuesService: success", { boardId, total: issues.length });
  return issues;
};

export const getEpicsFromBoardService = async (url: string, auth: string, boardId: string) => {
  logger.info("getEpicsFromBoardService: start", { boardId });
  const allIssues = await getBoardIssuesService(url, auth, boardId);
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

  const epicKeys = new Set<string>();
  const stats: Record<string, { total: number; done: number }> = {};

  for (const issue of allIssues) {
    const f = issue.fields;
    if (!f) continue;
    
    if (f.issuetype?.name === "Epic") {
      epicKeys.add(issue.key);
      continue;
    }
    
    const ek = f.epic?.key || (f.parent?.fields?.issuetype?.name === "Epic" ? f.parent.key : null);
    if (ek) {
      epicKeys.add(ek);
      if (!stats[ek]) {
        stats[ek] = { total: 0, done: 0 };
      }
      stats[ek].total++;
      if (f.status?.statusCategory?.key === "done") {
        stats[ek].done++;
      }
    }
  }

  logger.info("getEpicsFromBoardService: resolved epic keys", { boardId, epicCount: epicKeys.size });

  const epicPromises = [...epicKeys].map(async (k): Promise<Epic> => {
    try {
      const { data } = await axios.get(`${url}/rest/api/3/issue/${k}`, {
        params: { fields: "summary,status,creator" },
        headers,
      });
      const f = data.fields;
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
    } catch (err: any) {
      logger.warn("getEpicsFromBoardService: failed to fetch epic details, using fallback", { epicKey: k, error: err?.message });
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

  const result = await Promise.all(epicPromises);
  logger.info("getEpicsFromBoardService: success", { boardId, epicCount: result.length });
  return result;
};

export const getEpicDetailsPageService = async (url: string, auth: string, epicKey: string) => {
  logger.info("getEpicDetailsPageService: start", { epicKey });
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const jql = `"epic link" = "${epicKey}" OR "parent" = "${epicKey}" OR "Epic Link" = "${epicKey}"`;

  const [epicRes, searchRes] = await Promise.all([
    axios.get(`${url}/rest/api/3/issue/${epicKey}`, {
      params: { fields: "summary,status,creator" },
      headers,
    }),
    axios.get(`${url}/rest/api/3/search/jql`, {
      params: {
        jql,
        maxResults: 200,
        expand: "changelog",
        fields: "summary,status,priority,assignee,reporter,issuetype,created,resolutiondate,updated,labels,components,customfield_10016,customfield_10026,customfield_10030",
      },
      headers,
    }),
  ]);

  const epicData = epicRes.data;
  const searchData = searchRes.data;

  logger.info("getEpicDetailsPageService: fetched issues", { epicKey, issueCount: (searchData.issues || []).length });

  const issues = (searchData.issues || []).map((issue: any) => {
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
  
  const isEpicDone = epicData.fields.status?.statusCategory?.key === "done";
  const progress = total > 0 ? Math.round((done / total) * 100) : (isEpicDone ? 100 : 0);

  logger.info("getEpicDetailsPageService: success", { epicKey, childIssues: total, done, progress });

  return {
    epic: {
      key: epicKey,
      name: epicData.fields.summary || epicKey,
      summary: epicData.fields.summary || epicKey,
      status: epicData.fields.status?.name ?? "Unknown",
      progress,
      creator: epicData.fields.creator?.displayName ?? "Unknown",
      creatorAvatar: epicData.fields.creator?.avatarUrls?.["24x24"] ?? "",
    },
    issues,
  };
};
// ─── Defect Analytics ────────────────────────────────────────────────────────

type DefectPriority = { priority: string; count: number; openCount: number; avgDays: number };
type DefectAssignee = { name: string; open: number; resolved: number };
type DefectBug     = { key: string; summary: string; priority: string; ageDays: number; assignee: string };
export type OpenIssue = { key: string; summary: string; priority: string; status: string; ageDays: number; assignee: string };

export type DefectAnalyticsResult = {
  totalBugs: number; openBugs: number; resolvedBugs: number;
  critHighOpen: number; avgResolutionDays: number; escapeRate: number;
  byPriority: DefectPriority[];
  trend: { week: string; created: number; resolved: number }[];
  aging: { label: string; count: number; color: string }[];
  byAssignee: DefectAssignee[];
  oldestBugs: DefectBug[];
  openIssuesList: OpenIssue[];
};

const _defectCache = new Map<string, { data: DefectAnalyticsResult; expiresAt: number }>();

export const getDefectAnalyticsService = async (
  url: string, auth: string, boardId: string,
): Promise<DefectAnalyticsResult> => {
  const cacheKey = `${url}::${boardId}::${auth.slice(-16)}`;
  const cached = _defectCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const searchUrl = `${url}/rest/api/3/search/jql`;
  const boardIssueUrl = `${url}/rest/agile/1.0/board/${boardId}/issue`;
  const escape = (s: string) => s.replace(/"/g, '\\"');

  // ── Step 1: board config + issue types in parallel ────────────────────────
  // Board statuses endpoint lists every issue type on the board by name — we use
  // this to discover the actual bug-type name(s) instead of hardcoding "Bug".
  const [configRes, boardStatusesRes] = await Promise.allSettled([
    axios.get(`${url}/rest/agile/1.0/board/${boardId}/configuration`, { headers }),
    axios.get(`${url}/rest/agile/1.0/board/${boardId}/statuses`, { headers }),
  ]);

  const filterId: string | null =
    configRes.status === "fulfilled" && configRes.value.data?.filter?.id
      ? String(configRes.value.data.filter.id)
      : null;

  // Find issue types whose names suggest "bug/defect" semantics.
  const BUG_KEYWORDS = ["bug", "defect", "fault", "error", "incident", "issue"];
  let bugTypes: string[] = [];
  if (boardStatusesRes.status === "fulfilled") {
    const allTypes: string[] = (boardStatusesRes.value.data ?? [])
      .map((t: any) => t.name as string)
      .filter(Boolean);
    bugTypes = allTypes.filter((name) =>
      BUG_KEYWORDS.some((kw) => name.toLowerCase().includes(kw)),
    );
    // If the board has no bug-keyword types, fall back to every type (e.g. all
    // issues are tracked as tasks in this project) so the page still shows data.
    if (bugTypes.length === 0) bugTypes = allTypes;
  }
  // Final fallback when the statuses endpoint is unavailable.
  if (bugTypes.length === 0) bugTypes = ["Bug"];

  logger.info("getDefectAnalyticsService: bug types detected", { boardId, bugTypes });

  const bugTypeJql = bugTypes.map((t) => `"${escape(t)}"`).join(", ");
  const bugFilter = `issuetype in (${bugTypeJql})`;

  // ── Step 2: build scope and count helpers ─────────────────────────────────
  // Primary path: filter-scoped JQL (fast, accurate for any board size).
  // Fallback path: board API with jql param (same scope as the board itself).
  const filterScope = filterId ? `filter = ${filterId} AND ${bugFilter}` : null;
  const FIELDS = "key,summary,status,priority,assignee,created,resolutiondate";

  const searchCount = (jql: string) =>
    axios.get(searchUrl, { params: { jql, maxResults: 0 }, headers })
      .then((r) => (r.data.total ?? 0) as number)
      .catch(() => 0);

  const boardCount = (jql: string) =>
    axios.get(boardIssueUrl, { params: { jql, maxResults: 0 }, headers })
      .then((r) => (r.data.total ?? 0) as number)
      .catch(() => 0);

  // ── Step 3: KPI counts — try filter JQL first, fall back to board API ─────
  let totalBugs = 0, openBugs = 0, critHighOpen = 0, reopenedBugs = 0;
  let usedFilterScope = false;

  if (filterScope) {
    [totalBugs, openBugs, critHighOpen, reopenedBugs] = await Promise.all([
      searchCount(filterScope),
      searchCount(`${filterScope} AND statusCategory != Done`),
      searchCount(`${filterScope} AND priority in (Highest, High) AND statusCategory != Done`),
      searchCount(`${filterScope} AND status = Reopened`),
    ]);
    usedFilterScope = totalBugs > 0;
    logger.info("getDefectAnalyticsService: filter-scope counts", { boardId, totalBugs, usedFilterScope });
  }

  // If filter returned 0 (inaccessible or genuinely empty), use the board API.
  if (!usedFilterScope) {
    [totalBugs, openBugs, critHighOpen, reopenedBugs] = await Promise.all([
      boardCount(bugFilter),
      boardCount(`${bugFilter} AND statusCategory != Done`),
      boardCount(`${bugFilter} AND priority in (Highest, High) AND statusCategory != Done`),
      boardCount(`${bugFilter} AND status = Reopened`),
    ]);
    logger.info("getDefectAnalyticsService: board-api counts", { boardId, totalBugs });
  }

  // ── Step 4: fetch up to 500 recent bugs for detailed analytics ────────────
  const recentJql = `${usedFilterScope ? filterScope! : bugFilter} AND created >= -90d ORDER BY created DESC`;
  let rawIssues: any[] = [];

  try {
    const { data } = usedFilterScope
      ? await axios.get(searchUrl, { params: { jql: recentJql, maxResults: 500, fields: FIELDS }, headers })
      : await axios.get(boardIssueUrl, { params: { jql: recentJql, maxResults: 500, fields: FIELDS }, headers });
    rawIssues = data.issues ?? [];
  } catch (err: any) {
    logger.warn("getDefectAnalyticsService: recent-bug fetch failed", { boardId, error: err?.message });
  }

  type BugIssue = {
    key: string; summary: string; priority: string; statusName: string; catKey: string;
    assignee: { displayName: string } | null; created: string; resolutionDate: string | null;
  };
  const issues: BugIssue[] = rawIssues.map((i: any) => {
    const f = i.fields ?? {};
    return {
      key: i.key,
      summary: f.summary ?? "",
      priority: f.priority?.name ?? "Medium",
      statusName: f.status?.name ?? "Unknown",
      catKey: f.status?.statusCategory?.key ?? "new",
      assignee: f.assignee ? { displayName: f.assignee.displayName } : null,
      created: f.created,
      resolutionDate: f.resolutiondate ?? null,
    };
  });

  // ── Step 5: aggregate from fetched issues ─────────────────────────────────
  const resolvedWithDates = issues.filter((i) => i.catKey === "done" && i.created && i.resolutionDate);
  const avgResolutionDays = resolvedWithDates.length > 0
    ? Math.round(resolvedWithDates.reduce((s, i) =>
        s + (new Date(i.resolutionDate!).getTime() - new Date(i.created).getTime()) / 86_400_000, 0)
      / resolvedWithDates.length)
    : 0;

  const priMap = new Map<string, { count: number; open: number; days: number; res: number }>();
  for (const i of issues) {
    const e = priMap.get(i.priority) ?? { count: 0, open: 0, days: 0, res: 0 };
    e.count++;
    if (i.catKey !== "done") e.open++;
    if (i.catKey === "done" && i.created && i.resolutionDate) {
      e.days += (new Date(i.resolutionDate).getTime() - new Date(i.created).getTime()) / 86_400_000;
      e.res++;
    }
    priMap.set(i.priority, e);
  }
  const PRI_ORDER = ["Highest", "High", "Medium", "Low", "Lowest"];
  const byPriority: DefectPriority[] = [...priMap.entries()]
    .map(([priority, e]) => ({
      priority, count: e.count, openCount: e.open,
      avgDays: e.res > 0 ? Math.round(e.days / e.res) : 0,
    }))
    .sort((a, b) => (PRI_ORDER.indexOf(a.priority) + 99) % 100 - (PRI_ORDER.indexOf(b.priority) + 99) % 100);

  const now = Date.now();
  const weekBuckets: { label: string; start: number; end: number; created: number; resolved: number }[] = [];
  for (let w = 11; w >= 0; w--) {
    const start = now - (w + 1) * 7 * 86_400_000;
    const d = new Date(start);
    weekBuckets.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, start, end: now - w * 7 * 86_400_000, created: 0, resolved: 0 });
  }
  for (const i of issues) {
    const ct = new Date(i.created).getTime();
    for (const b of weekBuckets) if (ct >= b.start && ct < b.end) { b.created++; break; }
    if (i.resolutionDate) {
      const rt = new Date(i.resolutionDate).getTime();
      for (const b of weekBuckets) if (rt >= b.start && rt < b.end) { b.resolved++; break; }
    }
  }
  const trend = weekBuckets.map(({ label, created, resolved }) => ({ week: label, created, resolved }));

  const aging = [
    { label: "< 7 days",   count: 0, color: "#22c55e" },
    { label: "7–30 days",  count: 0, color: "#eab308" },
    { label: "30–90 days", count: 0, color: "#f97316" },
    { label: "> 90 days",  count: 0, color: "#ef4444" },
  ];
  for (const i of issues.filter((x) => x.catKey !== "done")) {
    const d = (now - new Date(i.created).getTime()) / 86_400_000;
    if (d < 7) aging[0].count++;
    else if (d < 30) aging[1].count++;
    else if (d < 90) aging[2].count++;
    else aging[3].count++;
  }

  const asgMap = new Map<string, { open: number; resolved: number }>();
  for (const i of issues) {
    const name = i.assignee?.displayName ?? "Unassigned";
    const e = asgMap.get(name) ?? { open: 0, resolved: 0 };
    if (i.catKey === "done") e.resolved++; else e.open++;
    asgMap.set(name, e);
  }
  const byAssignee: DefectAssignee[] = [...asgMap.entries()]
    .map(([name, e]) => ({ name, open: e.open, resolved: e.resolved }))
    .sort((a, b) => b.open - a.open)
    .slice(0, 8);

  const openSorted = issues
    .filter((i) => i.catKey !== "done")
    .map((i) => ({
      key: i.key, summary: i.summary, priority: i.priority,
      status: i.statusName,
      ageDays: Math.floor((now - new Date(i.created).getTime()) / 86_400_000),
      assignee: i.assignee?.displayName ?? "Unassigned",
    }))
    .sort((a, b) => b.ageDays - a.ageDays);

  const oldestBugs: DefectBug[] = openSorted.slice(0, 10);
  const openIssuesList: OpenIssue[] = openSorted.slice(0, 100);

  const result: DefectAnalyticsResult = {
    totalBugs, openBugs,
    resolvedBugs: totalBugs - openBugs,
    critHighOpen, avgResolutionDays,
    escapeRate: totalBugs > 0 ? Math.round((reopenedBugs / totalBugs) * 100) : 0,
    byPriority, trend, aging, byAssignee, oldestBugs, openIssuesList,
  };

  _defectCache.set(cacheKey, { data: result, expiresAt: Date.now() + 5 * 60 * 1000 });
  return result;
};

// ─── Single Issue Detail ──────────────────────────────────────────────────────

function extractAdfText(node: any): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (Array.isArray(node.content)) return node.content.map(extractAdfText).join("");
  return "";
}

export const getIssueService = async (url: string, auth: string, issueKey: string) => {
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const { data } = await axios.get(`${url}/rest/api/3/issue/${issueKey}`, {
    params: {
      expand: "changelog",
      fields: "summary,description,status,priority,assignee,reporter,created,updated,resolutiondate,labels,components,comment,issuetype,customfield_10016,customfield_10026,customfield_10030",
    },
    headers,
  });

  const f = data.fields ?? {};

  const statusHistory: { from: string; to: string; author: string; date: string }[] = [];
  for (const history of (data.changelog?.histories ?? [])) {
    for (const item of history.items) {
      if (item.field === "status") {
        statusHistory.push({
          from: item.fromString ?? "",
          to: item.toString ?? "",
          author: history.author?.displayName ?? "Unknown",
          date: history.created,
        });
      }
    }
  }

  const comments = (f.comment?.comments ?? []).slice(-20).map((c: any) => ({
    author: c.author?.displayName ?? "Unknown",
    avatarUrl: c.author?.avatarUrls?.["24x24"] ?? "",
    body: extractAdfText(c.body),
    created: c.created,
  }));

  return {
    key: data.key,
    summary: f.summary ?? "",
    description: extractAdfText(f.description),
    status: f.status?.name ?? "Unknown",
    statusCategoryKey: f.status?.statusCategory?.key ?? "new",
    statusCategoryName: f.status?.statusCategory?.name ?? "To Do",
    priority: f.priority?.name ?? "Medium",
    issueType: f.issuetype?.name ?? "Bug",
    assignee: f.assignee
      ? { displayName: f.assignee.displayName, avatarUrl: f.assignee.avatarUrls?.["24x24"] ?? "" }
      : null,
    reporter: f.reporter
      ? { displayName: f.reporter.displayName, avatarUrl: f.reporter.avatarUrls?.["24x24"] ?? "" }
      : null,
    created: f.created ?? null,
    updated: f.updated ?? null,
    resolutionDate: f.resolutiondate ?? null,
    labels: (f.labels ?? []) as string[],
    components: ((f.components ?? []) as any[]).map((c) => c.name as string),
    storyPoints: f.customfield_10016 ?? f.customfield_10026 ?? f.customfield_10030 ?? null,
    statusHistory,
    comments,
  };
};
