import axios from "axios";
import { Epic, Project } from "../interface/interface";

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
  }))

  return ProjectName;
}

export const getBoardService = async (url: string, auth: string, project: string) => {
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
  )
  const BoardName = response.data.values.map((boards: any) => ({
    name: boards.name,
    id: boards.id,
    projectKey: boards.location?.projectKey,
    type: boards.type
  }))

  return BoardName;
}



export const getIssuesByJQL = async (url: string, auth: string, jql: string) => {
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const searchUrl = `${url}/rest/api/3/search/jql`;
  const maxResults = 100;
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
  const maxResults = 50;

  const { data: first } = await jiraGetWithRetry(() =>
    axios.get(baseUrl, { params: { startAt: 0, maxResults }, headers })
  );
  const pages = Math.ceil(first.total / maxResults);
  const issues = [...first.issues];

  for (let page = 1; page < pages; page++) {
    const { data } = await jiraGetWithRetry(() =>
      axios.get(baseUrl, {
        params: { startAt: page * maxResults, maxResults },
        headers,
      })
    );
    issues.push(...data.issues);
  }

  return issues;
};

export const getEpicsFromBoardService = async (url: string, auth: string, boardId: string) => {
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

  return [...epicMap.values()];
};

// Fetch epics via JQL (no board constraint) — one paginated query, no per-board API calls.
// Used for "all projects" and "project-specific" views.
export const getEpicsFromJQLService = async (url: string, auth: string, projectKey?: string): Promise<Epic[]> => {
  const { projectFilter } = await buildProjectJQL(url, auth, projectKey);
  const jql = `${projectFilter}issuetype = Epic ORDER BY created DESC`;

  const { issues } = await getIssuesByJQL(url, auth, jql);

  return issues.map(({ key, fields: f }: any) => ({
    key,
    name: f.summary || key,
    summary: f.summary || key,
    status: f.status?.name ?? "Unknown",
    done: f.status?.statusCategory?.key === "done",
  }));
};

type BoardStatsOptions = {
  boardId?: string;
  projectKey?: string;
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

export const getBoardStatsService = async (url: string, auth: string, options: BoardStatsOptions = {}) => {
  const { boardId, projectKey } = options;

  if (boardId) {
    // Single board — fetch the board's saved filter from its configuration,
    // then use JQL (filter = <id>) to count issues accurately.
    // This avoids the agile board issue endpoint which only returns backlog
    // items for Scrum boards and misses all sprint issues.
    const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
    const boardConfig = await jiraGetWithRetry(() =>
      axios.get(`${url}/rest/agile/1.0/board/${boardId}/configuration`, { headers })
    );
    const filterId: string | undefined = boardConfig.data?.filter?.id;

    if (filterId) {
      const filterJql = `filter = ${filterId}`;
      const [totalIssues, todoCount, inProgressCount, doneCount] = await Promise.all([
        getCountFromJQL(url, auth, filterJql),
        getCountFromJQL(url, auth, `${filterJql} AND statusCategory = "To Do"`),
        getCountFromJQL(url, auth, `${filterJql} AND statusCategory = "In Progress"`),
        getCountFromJQL(url, auth, `${filterJql} AND statusCategory = "Done"`),
      ]);
      return { totalIssues, todoCount, inProgressCount, doneCount, boardCount: 1, failedBoardCount: 0 };
    }

    // Fallback: board has no saved filter — count from the board issues endpoint.
    const issues = await getBoardIssuesService(url, auth, boardId);
    let totalIssues = 0;
    let todoCount = 0;
    let inProgressCount = 0;
    let doneCount = 0;

    for (const { fields: f } of issues) {
      totalIssues++;
      const statusCategory = f.status?.statusCategory?.key;
      if (statusCategory === "new") {
        todoCount++;
      } else if (statusCategory === "indeterminate") {
        inProgressCount++;
      } else if (statusCategory === "done") {
        doneCount++;
      }
    }

    return { totalIssues, todoCount, inProgressCount, doneCount, boardCount: 1, failedBoardCount: 0 };
  }

  // Project-specific or all-projects: 4 parallel count-only JQL calls.
  // Issues belong to projects, not boards — JQL project-level counts are unique and duplicate-free.
  // buildProjectJQL ensures the query is always bounded (Jira rejects unbounded queries).
  const { projectFilter, totalJql } = await buildProjectJQL(url, auth, projectKey);
  if (!totalJql) {
    return { totalIssues: 0, todoCount: 0, inProgressCount: 0, doneCount: 0, boardCount: undefined, failedBoardCount: 0 };
  }

  const [totalIssues, todoCount, inProgressCount, doneCount] = await Promise.all([
    getCountFromJQL(url, auth, totalJql),
    getCountFromJQL(url, auth, `${projectFilter}statusCategory = "To Do"`),
    getCountFromJQL(url, auth, `${projectFilter}statusCategory = "In Progress"`),
    getCountFromJQL(url, auth, `${projectFilter}statusCategory = "Done"`),
  ]);

  return {
    totalIssues,
    todoCount,
    inProgressCount,
    doneCount,
    boardCount: undefined,
    failedBoardCount: 0,
  };
};