import axios from "axios";
import { Epic, Project } from "../interface/interface";

export const loginService = async (email: string, url: string, token: string) => {
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  const response = await axios.get(`${url}/rest/api/3/myself`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  return { user: response.data, auth };
};

export const getProjectService = async (url: string, auth: string) => {
  const { data } = await axios.get(`${url}/rest/api/3/project/search`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  return (data.values || []).map((project: Project) => ({
    name: project.name,
    key: project.key,
  }));
};

export const getBoardService = async (url: string, auth: string, project: string) => {
  const { data } = await axios.get(`${url}/rest/agile/1.0/board`, {
    params: { projectKeyOrId: project },
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  return (data.values || []).map((boards: any) => ({
    name: boards.name,
    id: boards.id,
    projectKey: boards.location?.projectKey,
    type: boards.type,
  }));
};

export const getBoardIssuesService = async (url: string, auth: string, boardId: string) => {
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
  return issues;
};

export const getEpicsFromBoardService = async (url: string, auth: string, boardId: string) => {
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
    } catch {
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

  return Promise.all(epicPromises);
};

export const getEpicDetailsPageService = async (url: string, auth: string, epicKey: string) => {
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

// ─── Dashboard ───────────────────────────────────────────────────────────────

type DashboardResult = {
  total: number; todo: number; inProgress: number; done: number; openCount: number;
  statusChart: { name: string; count: number; category: string }[];
  statusTableData: { status: string; category: string; count: number; pct: number }[];
  issueTypeData: { name: string; count: number }[];
  priorityData: { name: string; count: number }[];
};

const _dashboardCache = new Map<string, { data: DashboardResult; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000;

const EMPTY_RESULT: DashboardResult = {
  total: 0, todo: 0, inProgress: 0, done: 0, openCount: 0,
  statusChart: [], statusTableData: [], issueTypeData: [], priorityData: [],
};

export const getDashboardDataService = async (url: string, auth: string, boardId: string): Promise<DashboardResult> => {
  const cached = _dashboardCache.get(boardId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const boardIssueUrl = `${url}/rest/agile/1.0/board/${boardId}/issue`;
  const searchUrl = `${url}/rest/api/3/search/jql`;
  const escape = (s: string) => s.replace(/"/g, '\\"');


  const [firstPageRes, boardStatusesRes, configRes, boardInfoRes, prioritiesRes] = await Promise.allSettled([
    axios.get(boardIssueUrl, { params: { startAt: 0, maxResults: 100, fields: "status,priority,issuetype" }, headers }),
    axios.get(`${url}/rest/agile/1.0/board/${boardId}/statuses`, { headers }),
    axios.get(`${url}/rest/agile/1.0/board/${boardId}/configuration`, { headers }),
    axios.get(`${url}/rest/agile/1.0/board/${boardId}`, { headers }),
    axios.get(`${url}/rest/api/3/priority`, { headers }),
  ]);

  if (firstPageRes.status === "rejected") return EMPTY_RESULT;

  const boardTotal: number = firstPageRes.value.data.total ?? 0;
  const sampleIssues: any[] = firstPageRes.value.data.issues ?? [];
  if (boardTotal === 0) return EMPTY_RESULT;

  const filterId: string | null =
    configRes.status === "fulfilled" && configRes.value.data?.filter?.id
      ? String(configRes.value.data.filter.id)
      : null;

  const projectKey: string | null =
    boardInfoRes.status === "fulfilled"
      ? boardInfoRes.value.data?.location?.projectKey ?? null
      : null;

  const statusCategoryMap = new Map<string, string>(); // status name → category name
  if (boardStatusesRes.status === "fulfilled") {
    for (const group of (boardStatusesRes.value.data ?? [])) {
      for (const s of (group.statuses ?? [])) {
        if (s.name) statusCategoryMap.set(s.name, s.statusCategory?.name ?? "To Do");
      }
    }
  }
  for (const issue of sampleIssues) {
    const f = issue.fields ?? {};
    if (f.status?.name && !statusCategoryMap.has(f.status.name))
      statusCategoryMap.set(f.status.name, f.status.statusCategory?.name ?? "To Do");
  }

  let typeNames: string[] = [...new Set<string>(
    sampleIssues.map((i: any) => i.fields?.issuetype?.name).filter(Boolean)
  )];
  if (projectKey) {
    try {
      const { data: projectStatuses } = await axios.get(
        `${url}/rest/api/3/project/${projectKey}/statuses`, { headers }
      );
      const projectTypes = (projectStatuses ?? []).map((t: any) => t.name).filter(Boolean) as string[];
      if (projectTypes.length > 0)
        typeNames = [...new Set([...projectTypes, ...typeNames])];
    } catch { /* keep sample-based list */ }
  }
  let priorityNames: string[] = [...new Set<string>(
    sampleIssues.map((i: any) => i.fields?.priority?.name).filter(Boolean)
  )];
  if (prioritiesRes.status === "fulfilled") {
    const allPriorities = (prioritiesRes.value.data ?? []).map((p: any) => p.name).filter(Boolean) as string[];
    if (allPriorities.length > 0)
      priorityNames = [...new Set([...allPriorities, ...priorityNames])];
  }

  let filterTotal = 0;
  let todo = 0, inProgress = 0, done = 0;
  let statusCounts: { name: string; count: number; category: string }[] = [];
  let typeCounts: { name: string; count: number }[] = [];
  let priorityCounts: { name: string; count: number }[] = [];
  let gotFilterCounts = false;

  if (filterId) {
    try {
      const jql = `filter = ${filterId}`;
      const qc = (q: string) =>
        axios.get(searchUrl, { params: { jql: q, maxResults: 0 }, headers })
          .then((r) => (r.data.total ?? 0) as number)
          .catch(() => 0);

      const [ft, td, ip, dn] = await Promise.all([
        qc(jql),
        qc(`${jql} AND statusCategory = "To Do"`),
        qc(`${jql} AND statusCategory = "In Progress"`),
        qc(`${jql} AND statusCategory = "Done"`),
      ]);

      const [sRes, tRes, pRes] = await Promise.all([
        Promise.all([...statusCategoryMap.keys()].slice(0, 20).map(async (name) => ({
          name, category: statusCategoryMap.get(name)!,
          count: await qc(`${jql} AND status = "${escape(name)}"`),
        }))),
        Promise.all(typeNames.slice(0, 20).map(async (name) => ({
          name, count: await qc(`${jql} AND issuetype = "${escape(name)}"`),
        }))),
        Promise.all(priorityNames.slice(0, 10).map(async (name) => ({
          name, count: await qc(`${jql} AND priority = "${escape(name)}"`),
        }))),
      ]);

      filterTotal = ft; todo = td; inProgress = ip; done = dn;
      statusCounts = sRes; typeCounts = tRes; priorityCounts = pRes;
      gotFilterCounts = filterTotal > 0;
    } catch { /* fall through to board-api jql */ }
  }

  if (!gotFilterCounts) {

    const bq = (jql: string) =>
      axios.get(boardIssueUrl, { params: { jql, maxResults: 0 }, headers })
        .then((r) => (r.data.total ?? 0) as number)
        .catch(() => 0);

    [todo, inProgress, done] = await Promise.all([
      bq('statusCategory = "To Do"'),
      bq('statusCategory = "In Progress"'),
      bq('statusCategory = "Done"'),
    ]);
    filterTotal = todo + inProgress + done || boardTotal;

    const [sRes, tRes, pRes] = await Promise.all([
      Promise.all([...statusCategoryMap.keys()].slice(0, 20).map(async (name) => ({
        name, category: statusCategoryMap.get(name)!,
        count: await bq(`status = "${escape(name)}"`),
      }))),
      Promise.all(typeNames.slice(0, 20).map(async (name) => ({
        name, count: await bq(`issuetype = "${escape(name)}"`),
      }))),
      Promise.all(priorityNames.slice(0, 10).map(async (name) => ({
        name, count: await bq(`priority = "${escape(name)}"`),
      }))),
    ]);
    statusCounts = sRes; typeCounts = tRes; priorityCounts = pRes;
  }

 
  const scale = filterTotal > 0 ? boardTotal / filterTotal : 1;
  const scaledTodo = Math.round(todo * scale);
  const scaledIP   = Math.round(inProgress * scale);
  const scaledDone = boardTotal - scaledTodo - scaledIP; // ensure exact sum

  const statusTableData = statusCounts
    .map((r) => ({ status: r.name, category: r.category, count: Math.round(r.count * scale) }))
    .filter((r) => r.count > 0)
    .map((r) => ({ ...r, pct: Math.round((r.count / boardTotal) * 100) }))
    .sort((a, b) => b.count - a.count);

  const result: DashboardResult = {
    total: boardTotal,
    todo: scaledTodo,
    inProgress: scaledIP,
    done: scaledDone,
    openCount: boardTotal - scaledDone,
    statusChart: statusTableData.slice(0, 12).map(({ status, count, category }) => ({ name: status, count, category })),
    statusTableData,
    issueTypeData: typeCounts
      .map((r) => ({ name: r.name, count: Math.round(r.count * scale) }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count),
    priorityData: priorityCounts
      .map((r) => ({ name: r.name, count: Math.round(r.count * scale) }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count),
  };

  _dashboardCache.set(boardId, { data: result, expiresAt: Date.now() + CACHE_TTL });
  return result;
};