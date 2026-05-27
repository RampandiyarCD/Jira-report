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