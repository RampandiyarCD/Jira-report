import axios from "axios";
import { Epic, Project } from "../interface/interface";
import { fileURLToPath } from "node:url";

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
  const response = await axios.get(
    `${url}/rest/api/3/project/search`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    }
  );
  const ProjectName = response.data.values.map((project: Project) => ({
    name: project.name,
    key: project.key
  }))

  return ProjectName;
}

export const getBoardService = async (url: string, auth: string, project: string) => {
  const response = await axios.get(
    `${url}/rest/agile/1.0/board`,
    {
      params: {
        projectKeyOrId: project
      },
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      }
    }
  )
  const BoardName = response.data.values.map((boards: any) => ({
    name: boards.name,
    id: boards.id,
    projectKey: boards.location?.projectKey,
    type: boards.type
  }))

  return BoardName;
}



export const getBoardIssuesService = async (url: string, auth: string, boardId: string) => {
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };
  const baseUrl = `${url}/rest/agile/1.0/board/${boardId}/issue`;
  const maxResults = 50;

  const { data: first } = await axios.get(baseUrl, { params: { startAt: 0, maxResults }, headers });
  const pages = Math.ceil(first.total / maxResults);

  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      axios.get(baseUrl, { params: { startAt: (i + 1) * maxResults, maxResults }, headers }).then(r => r.data.issues)
    )
  );

  return [...first.issues, ...rest.flat()];
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

export const getEpicDetailsService = async (epicKey: string, auth: string, url: string) => {
  const response = await axios.get(`${url}/rest/api/3/issue/${epicKey}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    }
  })
  return response.data;
}