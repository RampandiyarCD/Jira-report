import axios from "axios";
import { Epic, Project } from "../interface/interface";

// ─── Backend in-memory TTL cache ─────────────────────────────────────────────
// Avoids re-fetching Jira on every page navigation. Cache is per-user scoped
// by a prefix of the auth token so multiple sessions don't share data.
const _svcCache = new Map<string, { data: any; ts: number; ttl: number }>();
const SVC_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const SVC_DETAILS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCachedSvc<T>(key: string): T | null {
  const e = _svcCache.get(key);
  if (e && Date.now() - e.ts < e.ttl) return e.data as T;
  _svcCache.delete(key);
  return null;
}

function setCachedSvc(key: string, data: any, ttl = SVC_CACHE_TTL_MS): void {
  _svcCache.set(key, { data, ts: Date.now(), ttl });
}

function svcKey(url: string, auth: string, fn: string, params = ""): string {
  return `${url}|${auth.slice(0, 16)}|${fn}|${params}`;
}
// ─────────────────────────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getRetryDelayMs = (error: any, attempt: number) => {
  const retryAfterHeader = error?.response?.headers?.["retry-after"];
  const retryAfterSeconds = Number(retryAfterHeader);

  if (!Number.isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  // Exponential backoff for 429/5xx responses when Jira does not provide Retry-After.
  return Math.min(1000 * 2 ** attempt, 12000);
};

const jiraGetWithRetry = async <T>(request: () => Promise<T>, maxRetries = 4): Promise<T> => {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await request();
    } catch (error: any) {
      lastError = error;
      const status = error?.response?.status;
      const shouldRetry = status === 429 || (status >= 500 && status < 600);

      if (!shouldRetry || attempt === maxRetries) {
        throw error;
      }

      const delayMs = getRetryDelayMs(error, attempt);
      await wait(delayMs);
    }
  }

  throw lastError;
};

export const loginService = async (email: string, url: string, token: string) => {
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const response = await axios.get(
    `${url}/rest/api/3/myself`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    }
  );
  return { user: response.data, auth };
};

export const logoutService = async () => {
  localStorage.clear();
}

export const getProjectService = async (url: string, auth: string) => {
  const ckey = svcKey(url, auth, "getProjects");
  const cached = getCachedSvc<any[]>(ckey);
  if (cached) return cached;

  const response = await jiraGetWithRetry(() =>
    axios.get(
      `${url}/rest/api/3/project/search`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      }
    )
  );
  const ProjectName = response.data.values.map((project: Project) => ({
    name: project.name,
    key: project.key
  }));

  setCachedSvc(ckey, ProjectName);
  return ProjectName;
}

export const getBoardService = async (url: string, auth: string, project: string) => {
  const ckey = svcKey(url, auth, "getBoards", project);
  const cached = getCachedSvc<any[]>(ckey);
  if (cached) return cached;

  const response = await jiraGetWithRetry(() =>
    axios.get(
      `${url}/rest/agile/1.0/board`,
      {
        params: project ? { projectKeyOrId: project } : undefined,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        }
      }
    )
  );
  const BoardName = response.data.values.map((boards: any) => ({
    name: boards.name,
    id: boards.id,
    projectKey: boards.location?.projectKey,
    type: boards.type
  }));

  setCachedSvc(ckey, BoardName);
  return BoardName;
}



export const getIssuesByJQL = async (url: string, auth: string, jql: string) => {
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const searchUrl = `${url}/rest/api/3/search/jql`;
  const maxResults = 1000;
  const fields = "summary,status,issuetype,parent,epic";

  const { data: first } = await jiraGetWithRetry(() =>
    axios.get(searchUrl, { params: { jql, maxResults, fields }, headers })
  );
  const issues = [...(first.issues ?? [])];
  let nextPageToken: string | undefined = first.nextPageToken;

  while (nextPageToken) {
    const { data } = await jiraGetWithRetry(() =>
      axios.get(searchUrl, {
        params: { jql, maxResults, fields, nextPageToken },
        headers,
      })
    );
    issues.push(...(data.issues ?? []));
    nextPageToken = data.nextPageToken;
  }

  return { issues, total: first.total ?? issues.length };
};

export const getBoardIssuesService = async (url: string, auth: string, boardId: string) => {
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const baseUrl = `${url}/rest/agile/1.0/board/${boardId}/issue`;
  const maxResults = 100;

  const { data: first } = await jiraGetWithRetry(() =>
    axios.get(baseUrl, { params: { startAt: 0, maxResults }, headers })
  );
  const total: number = first.total ?? 0;
  const issues: any[] = [...(first.issues ?? [])];

  if (total > maxResults) {
    // Offset-based agile endpoint: fire all remaining pages in parallel.
    const extraPages = Math.ceil((total - maxResults) / maxResults);
    const results = await Promise.all(
      Array.from({ length: extraPages }, (_, i) =>
        jiraGetWithRetry(() =>
          axios.get(baseUrl, {
            params: { startAt: (i + 1) * maxResults, maxResults },
            headers,
          })
        )
      )
    );
    for (const { data } of results) issues.push(...(data.issues ?? []));
  }

  return issues;
};

export const getEpicsFromBoardService = async (url: string, auth: string, boardId: string) => {
  const ckey = svcKey(url, auth, "epicsFromBoard", boardId);
  const cached = getCachedSvc<Epic[]>(ckey);
  if (cached) return cached;

  const allIssues = await getBoardIssuesService(url, auth, boardId);
  const epicMap = new Map<string, Epic>();

  const toEpic = (key: string, f: any): Epic => ({
    key,
    name: f.summary || f.name || key,
    summary: f.summary || f.name || key,
    status: f.status?.name ?? (f.done ? "Done" : "In Progress"),
    done: (f.status?.statusCategory?.key != null ? f.status.statusCategory.key === "done" : f.done) ?? false,
  });

  for (const { key, fields: f } of allIssues) {
    if (f.issuetype?.name === "Epic") epicMap.set(key, toEpic(key, f));
    else if (f.epic && !epicMap.has(f.epic.key)) epicMap.set(f.epic.key, toEpic(f.epic.key, f.epic));
    else if (f.parent?.fields?.issuetype?.name === "Epic" && !epicMap.has(f.parent.key))
      epicMap.set(f.parent.key, toEpic(f.parent.key, f.parent.fields));
  }

  const result = [...epicMap.values()];
  setCachedSvc(ckey, result);
  return result;
};

// Fetch epics via JQL (no board constraint) — one paginated query, no per-board API calls.
// Used for "all projects" and "project-specific" views.
export const getEpicsFromJQLService = async (url: string, auth: string, projectKey?: string): Promise<Epic[]> => {
  const ckey = svcKey(url, auth, "epicsFromJQL", projectKey ?? "");
  const cached = getCachedSvc<Epic[]>(ckey);
  if (cached) return cached;

  const { projectFilter } = await buildProjectJQL(url, auth, projectKey);
  const jql = `${projectFilter}issuetype = Epic ORDER BY created DESC`;

  const { issues } = await getIssuesByJQL(url, auth, jql);

  const result = issues.map(({ key, fields: f }: any) => ({
    key,
    name: f.summary || key,
    summary: f.summary || key,
    status: f.status?.name ?? "Unknown",
    done: f.status?.statusCategory?.key === "done",
  }));

  setCachedSvc(ckey, result);
  return result;
};

type BoardStatsOptions = {
  boardId?: string;
  projectKey?: string;
};

type JiraAggregateStats = {
  totalIssues: number;
  todoCount: number;
  inProgressCount: number;
  doneCount: number;
  statusBreakdown: Record<string, { count: number; category: string }>;
  issueTypeBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
};

// Build a bounded project JQL prefix to satisfy Jira's "no unbounded queries" rule.
// Returns e.g. 'project in ("KEY1","KEY2") AND ' for all-projects,
// or 'project = "KEY" AND ' for a specific project.
const buildProjectJQL = async (
  url: string,
  auth: string,
  projectKey?: string
): Promise<{ projectFilter: string; totalJql: string }> => {
  if (projectKey) {
    return {
      projectFilter: `project = "${projectKey}" AND `,
      totalJql: `project = "${projectKey}"`,
    };
  }
  const projects = await getProjectService(url, auth);
  if (projects.length === 0) return { projectFilter: "", totalJql: "" };
  const keys = projects.map((p: any) => `"${p.key}"`).join(",");
  return {
    projectFilter: `project in (${keys}) AND `,
    totalJql: `project in (${keys})`,
  };
};

// Fetch only the total count for a JQL query.
// The new /rest/api/3/search/jql endpoint uses cursor pagination and does not
// guarantee a `total` field. Strategy: request maxResults=5000 with fields=id only
// (minimal payload). Use `total` if Jira returns it; otherwise count issue IDs
// across nextPageToken pages.
const getCountFromJQL = async (url: string, auth: string, jql: string): Promise<number> => {
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const searchUrl = `${url}/rest/api/3/search/jql`;
  const params: Record<string, any> = { maxResults: 5000, fields: "id" };
  if (jql) params.jql = jql;

  const { data: first } = await jiraGetWithRetry(() =>
    axios.get(searchUrl, { params, headers })
  );

  if (typeof first.total === "number") return first.total;

  // Jira didn't return total — count IDs across all pages.
  let count: number = first.issues?.length ?? 0;
  let nextPageToken: string | undefined = first.nextPageToken;

  while (nextPageToken) {
    const { data } = await jiraGetWithRetry(() =>
      axios.get(searchUrl, {
        params: { jql: jql || undefined, maxResults: 5000, fields: "id", nextPageToken },
        headers,
      })
    );
    count += data.issues?.length ?? 0;
    nextPageToken = data.nextPageToken;
  }

  return count;
};

const getApproximateCountFromJQL = async (url: string, auth: string, jql: string): Promise<number> => {
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const { data } = await jiraGetWithRetry(() =>
    axios.post(`${url}/rest/api/3/search/approximate-count`, { jql }, { headers })
  );

  if (typeof data?.count !== "number") {
    throw new Error("Jira approximate-count response did not include a count");
  }

  return data.count;
};

const getFastCountFromJQL = async (url: string, auth: string, jql: string): Promise<number> => {
  try {
    return await getApproximateCountFromJQL(url, auth, jql);
  } catch {
    const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
    const { data } = await jiraGetWithRetry(() =>
      axios.get(`${url}/rest/api/3/search`, {
        params: { jql, maxResults: 0, fields: "id" },
        headers,
      })
    );

    if (typeof data?.total !== "number") {
      throw new Error("Jira did not return a fast count for the dashboard query");
    }

    return data.total;
  }
};

// Fast aggregate stats: Jira counts matching issues without returning issue rows.
// This keeps large boards/projects from paging through tens of thousands of issues.
const getIssueStatsFromJQLCounts = async (
  url: string,
  auth: string,
  jql: string
): Promise<JiraAggregateStats> => {
  const countJql = (query: string) => getFastCountFromJQL(url, auth, query);

  const [totalIssues, todoCount, inProgressCount, doneCount] = await Promise.all([
    countJql(jql),
    countJql(`${jql} AND statusCategory = "To Do"`),
    countJql(`${jql} AND statusCategory = "In Progress"`),
    countJql(`${jql} AND statusCategory = Done`),
  ]);

  return {
    totalIssues,
    todoCount,
    inProgressCount,
    doneCount,
    statusBreakdown: {
      "To Do": { count: todoCount, category: "To Do" },
      "In Progress": { count: inProgressCount, category: "In Progress" },
      Done: { count: doneCount, category: "Done" },
    },
    issueTypeBreakdown: {},
    priorityBreakdown: {},
  };
};


// Single-pass stats: fetches issues with only status field and computes all
// count metrics locally. Replaces 9 separate JQL count calls with 1 query.
// Parallel page concurrency limit — keeps us below Jira's rate limits while
// still fetching multiple pages simultaneously.
const PARALLEL_PAGE_CONCURRENCY = 5;
const DETAILS_PAGE_SIZE = 100; // Classic search API reliable max

const getIssueStatsFromJQL = async (
  url: string,
  auth: string,
  jql: string
): Promise<JiraAggregateStats> => {
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  // Use the classic search endpoint — unlike /search/jql it exposes `total` and
  // supports `startAt` so we can fetch all pages in parallel instead of sequentially.
  const searchUrl = `${url}/rest/api/3/search`;
  const fields = "status,issuetype,priority";

  const { data: first } = await jiraGetWithRetry(() =>
    axios.get(searchUrl, {
      params: { jql, maxResults: DETAILS_PAGE_SIZE, startAt: 0, fields },
      headers,
    })
  );

  const total: number =
    typeof first.total === "number" ? first.total : (first.issues?.length ?? 0);
  const allIssues: any[] = [...(first.issues ?? [])];

  // Build the list of startAt offsets for the remaining pages.
  const remainingStarts: number[] = [];
  for (let start = DETAILS_PAGE_SIZE; start < total; start += DETAILS_PAGE_SIZE) {
    remainingStarts.push(start);
  }

  // Fetch remaining pages in parallel batches to avoid hammering Jira.
  for (let i = 0; i < remainingStarts.length; i += PARALLEL_PAGE_CONCURRENCY) {
    const batch = remainingStarts.slice(i, i + PARALLEL_PAGE_CONCURRENCY);
    const results = await Promise.all(
      batch.map((startAt) =>
        jiraGetWithRetry(() =>
          axios.get(searchUrl, {
            params: { jql, maxResults: DETAILS_PAGE_SIZE, startAt, fields },
            headers,
          })
        )
      )
    );
    for (const { data } of results) {
      allIssues.push(...(data.issues ?? []));
    }
  }

  let todoCount = 0;
  let inProgressCount = 0;
  let doneCount = 0;
  const statusBreakdown: Record<string, { count: number; category: string }> = {};
  const issueTypeBreakdown: Record<string, number> = {};
  const priorityBreakdown: Record<string, number> = {};

  for (const { fields: f } of allIssues) {
    const catKey = f?.status?.statusCategory?.key;
    if (catKey === "new") todoCount++;
    else if (catKey === "indeterminate") inProgressCount++;
    else if (catKey === "done") doneCount++;

    const statusName: string = f?.status?.name ?? "Unknown";
    const statusCategory: string = f?.status?.statusCategory?.name ?? "To Do";
    const statusEntry = statusBreakdown[statusName] ?? { count: 0, category: statusCategory };
    statusEntry.count += 1;
    statusEntry.category = statusEntry.category || statusCategory;
    statusBreakdown[statusName] = statusEntry;

    const issueType: string = f?.issuetype?.name ?? "Unknown";
    issueTypeBreakdown[issueType] = (issueTypeBreakdown[issueType] ?? 0) + 1;

    const priority: string = f?.priority?.name ?? "Unknown";
    priorityBreakdown[priority] = (priorityBreakdown[priority] ?? 0) + 1;
  }

  return {
    totalIssues: total,
    todoCount,
    inProgressCount,
    doneCount,
    statusBreakdown,
    issueTypeBreakdown,
    priorityBreakdown,
  };
}

export const getBoardStatsService = async (url: string, auth: string, options: BoardStatsOptions = {}) => {
  const { boardId, projectKey } = options;
  const ckey = svcKey(url, auth, "boardStats", `${boardId ?? ""}:${projectKey ?? ""}`);
  const cached = getCachedSvc<any>(ckey);
  if (cached) return cached;

  let result: any;

  if (boardId) {
    // Single board — fetch the board's saved filter from its configuration,
    // then use a single JQL call with fields=status to compute all metrics.
    const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
    const boardConfig = await jiraGetWithRetry(() =>
      axios.get(`${url}/rest/agile/1.0/board/${boardId}/configuration`, { headers })
    );
    const filterId: string | undefined = boardConfig.data?.filter?.id;

    if (filterId) {
      const filterJql = `filter = ${filterId}`;
      const stats = await getIssueStatsFromJQLCounts(url, auth, filterJql);
      result = { ...stats, boardCount: 1, failedBoardCount: 0 };
    } else {
      // Fallback: board has no saved filter — derive stats from the issues endpoint.
      const issues = await getBoardIssuesService(url, auth, boardId);
      let totalIssues = 0;
      let todoCount = 0;
      let inProgressCount = 0;
      let doneCount = 0;
      const statusBreakdown: Record<string, { count: number; category: string }> = {};
      const issueTypeBreakdown: Record<string, number> = {};
      const priorityBreakdown: Record<string, number> = {};

      for (const { fields: f } of issues) {
        totalIssues++;
        const catKey = f.status?.statusCategory?.key;
        if (catKey === "new") todoCount++;
        else if (catKey === "indeterminate") inProgressCount++;
        else if (catKey === "done") doneCount++;
        const statusName: string = f.status?.name ?? "";
        const statusCategory: string = f.status?.statusCategory?.name ?? "To Do";
        const statusEntry = statusBreakdown[statusName] ?? { count: 0, category: statusCategory };
        statusEntry.count += 1;
        statusEntry.category = statusEntry.category || statusCategory;
        statusBreakdown[statusName] = statusEntry;

        const issueType: string = f.issuetype?.name ?? "Unknown";
        issueTypeBreakdown[issueType] = (issueTypeBreakdown[issueType] ?? 0) + 1;

        const priority: string = f.priority?.name ?? "Unknown";
        priorityBreakdown[priority] = (priorityBreakdown[priority] ?? 0) + 1;
      }

      result = {
        totalIssues,
        todoCount,
        inProgressCount,
        doneCount,
        statusBreakdown,
        issueTypeBreakdown,
        priorityBreakdown,
        boardCount: 1,
        failedBoardCount: 0,
      };
    }
  } else {
    // Project-specific or all-projects: single JQL call computing all metrics.
    const { totalJql } = await buildProjectJQL(url, auth, projectKey);
    if (!totalJql) {
      return {
        totalIssues: 0,
        todoCount: 0,
        inProgressCount: 0,
        doneCount: 0,
        statusBreakdown: {},
        issueTypeBreakdown: {},
        priorityBreakdown: {},
        boardCount: undefined,
        failedBoardCount: 0,
      };
    }

    const stats = await getIssueStatsFromJQLCounts(url, auth, totalJql);
    result = { ...stats, boardCount: undefined, failedBoardCount: 0 };
  }

  setCachedSvc(ckey, result);
  return result;
};

// Escape a value for use inside a quoted JQL string literal.
const escapeJqlValue = (v: string) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

// Fetch all statuses, issue types, and priorities from Jira metadata endpoints
// in one parallel burst. These are tiny payloads and rarely change.
const getJiraMetadata = async (url: string, auth: string) => {
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const [statusRes, typeRes, priorityRes] = await Promise.all([
    jiraGetWithRetry(() => axios.get(`${url}/rest/api/3/status`, { headers })),
    jiraGetWithRetry(() => axios.get(`${url}/rest/api/3/issuetype`, { headers })),
    jiraGetWithRetry(() => axios.get(`${url}/rest/api/3/priority`, { headers })),
  ]);
  return {
    statuses: (statusRes.data ?? []) as any[],
    issueTypes: (typeRes.data ?? []) as any[],
    priorities: (priorityRes.data ?? []) as any[],
  };
};

// Build detailed breakdowns by running parallel count queries for each
// status / issue-type / priority value. No bulk issue fetching needed.
const buildDetailedBreakdowns = async (
  url: string,
  auth: string,
  baseJql: string,
  filterStatusIds?: Set<string>
) => {
  const { statuses, issueTypes, priorities } = await getJiraMetadata(url, auth);

  // Narrow statuses to those configured on the board (when we have IDs).
  const relevantStatuses =
    filterStatusIds && filterStatusIds.size > 0
      ? statuses.filter((s: any) => filterStatusIds.has(String(s.id)))
      : statuses;

  const countFor = (jqlSuffix: string) =>
    getFastCountFromJQL(url, auth, `${baseJql} AND ${jqlSuffix}`).catch(() => 0);

  // Fire every count in one parallel burst.
  const [statusCounts, typeCounts, priorityCounts] = await Promise.all([
    Promise.all(
      relevantStatuses.map((s: any) =>
        countFor(`status = "${escapeJqlValue(s.name ?? "")}"`)
          .then((count) => ({ name: s.name as string, category: (s.statusCategory?.name ?? "To Do") as string, count }))
      )
    ),
    Promise.all(
      issueTypes.map((t: any) =>
        countFor(`issuetype = "${escapeJqlValue(t.name ?? "")}"`)
          .then((count) => ({ name: t.name as string, count }))
      )
    ),
    Promise.all(
      priorities.map((p: any) =>
        countFor(`priority = "${escapeJqlValue(p.name ?? "")}"`)
          .then((count) => ({ name: p.name as string, count }))
      )
    ),
  ]);

  const statusBreakdown: Record<string, { count: number; category: string }> = {};
  for (const { name, category, count } of statusCounts) {
    if (count > 0 && name) statusBreakdown[name] = { count, category };
  }

  const issueTypeBreakdown: Record<string, number> = {};
  for (const { name, count } of typeCounts) {
    if (count > 0 && name) issueTypeBreakdown[name] = count;
  }

  const priorityBreakdown: Record<string, number> = {};
  for (const { name, count } of priorityCounts) {
    if (count > 0 && name) priorityBreakdown[name] = count;
  }

  return { statusBreakdown, issueTypeBreakdown, priorityBreakdown };
};

export const getBoardStatsDetailsService = async (url: string, auth: string, options: BoardStatsOptions = {}) => {
  const { boardId, projectKey } = options;
  const ckey = svcKey(url, auth, "boardStatsDetails", `${boardId ?? ""}:${projectKey ?? ""}`);
  const cached = getCachedSvc<JiraAggregateStats>(ckey);
  if (cached) return cached;

  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

  let result: JiraAggregateStats;

  if (boardId) {
    // Fetch board config and fast stats in parallel — no issue rows needed.
    const [boardConfig, fastStats] = await Promise.all([
      jiraGetWithRetry(() =>
        axios.get(`${url}/rest/agile/1.0/board/${boardId}/configuration`, { headers })
      ),
      getBoardStatsService(url, auth, options),
    ]);

    const filterId: string | undefined = boardConfig.data?.filter?.id;

    // Collect the status IDs configured on this board's columns so we only
    // count statuses that actually appear in the board.
    const boardStatusIds = new Set<string>(
      (boardConfig.data?.columnConfig?.columns ?? [])
        .flatMap((col: any) => col.statuses ?? [])
        .map((s: any) => String(s.id))
        .filter(Boolean)
    );

    const baseJql = filterId
      ? `filter = ${filterId}`
      : `project = "${boardConfig.data?.location?.projectKey ?? ""}"`;

    const { statusBreakdown, issueTypeBreakdown, priorityBreakdown } =
      await buildDetailedBreakdowns(url, auth, baseJql, boardStatusIds);

    result = {
      ...fastStats,
      statusBreakdown,
      issueTypeBreakdown,
      priorityBreakdown,
    };
  } else {
    const [{ totalJql }, fastStats] = await Promise.all([
      buildProjectJQL(url, auth, projectKey),
      getBoardStatsService(url, auth, options),
    ]);

    if (!totalJql) {
      result = {
        totalIssues: 0,
        todoCount: 0,
        inProgressCount: 0,
        doneCount: 0,
        statusBreakdown: {},
        issueTypeBreakdown: {},
        priorityBreakdown: {},
      };
    } else {
      const { statusBreakdown, issueTypeBreakdown, priorityBreakdown } =
        await buildDetailedBreakdowns(url, auth, totalJql);
      result = { ...fastStats, statusBreakdown, issueTypeBreakdown, priorityBreakdown };
    }
  }

  setCachedSvc(ckey, result, SVC_DETAILS_CACHE_TTL_MS);
  return result;
};

export const getBoardIssueSummaryService = async (
  url: string,
  auth: string,
  options: BoardStatsOptions = {}
) => {
  const { boardId, projectKey } = options;
  const ckey = svcKey(url, auth, "issueSummary", `${boardId ?? ""}:${projectKey ?? ""}`);
  const cached = getCachedSvc<any[]>(ckey);
  if (cached) return cached;

  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

  let jql: string;
  if (boardId) {
    const boardConfig = await jiraGetWithRetry(() =>
      axios.get(`${url}/rest/agile/1.0/board/${boardId}/configuration`, { headers })
    );
    const filterId: string | undefined = boardConfig.data?.filter?.id;
    jql = filterId ? `filter = ${filterId}` : `project is not EMPTY ORDER BY created DESC`;
  } else {
    const { totalJql } = await buildProjectJQL(url, auth, projectKey);
    if (!totalJql) return [];
    jql = totalJql;
  }

  const searchUrl = `${url}/rest/api/3/search/jql`;
  const maxResults = 200;
  const fields = "status,issuetype,priority";

  const { data: first } = await jiraGetWithRetry(() =>
    axios.get(searchUrl, { params: { jql, maxResults, fields }, headers })
  );

  const allIssues: any[] = [...(first.issues ?? [])];
  let nextPageToken: string | undefined = first.nextPageToken;

  while (nextPageToken) {
    const { data } = await jiraGetWithRetry(() =>
      axios.get(searchUrl, { params: { jql, maxResults, fields, nextPageToken }, headers })
    );
    allIssues.push(...(data.issues ?? []));
    nextPageToken = data.nextPageToken;
  }

  const result = allIssues.map((issue: any) => ({
    status: issue.fields?.status?.name ?? "Unknown",
    statusCategory: issue.fields?.status?.statusCategory?.name ?? "To Do",
    issueType: issue.fields?.issuetype?.name ?? "Unknown",
    priority: issue.fields?.priority?.name ?? "Unknown",
  }));

  setCachedSvc(ckey, result);
  return result;
};
