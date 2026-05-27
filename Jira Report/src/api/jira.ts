import axios, { Axios } from "axios";


export const api: Axios = axios.create({
  baseURL: import.meta.env.VITE_CLIENT_URL,
  withCredentials: true,
});

export const handleLogin = async (email: string, url: string, token: string) => {
  return await api.post("/login", { email, url, token });
};

export const logoutApi = async () => {
  return await api.post("/logout");
}

export const getProjects = async () => {
  return await api.get("/getProjects");
}

export const getBoards = async (projectKey: string) => {
  return await api.get(`/getBoards/${encodeURIComponent(projectKey)}`);
}

export const getBoardIssues = async (boardId: number) => {
  return await api.get(`/getboardissues/${boardId}`);
}

export const getEpics = async (boardId: number) => {
  return await api.get(`/getepics/${boardId}`);
}

export const getEpicDetailsPage = async (epicKey: string, refresh = false) => {
  const query = refresh ? `?${new URLSearchParams({ refresh: "true" }).toString()}` : "";
  return await api.get(`/getepicdetailspage/${encodeURIComponent(epicKey)}${query}`);
}

// Zephyr APIs
export const saveZephyrConfig = async (config: {
  zephyrAccessKey: string;
  zephyrSecretKey: string;
  zephyrAccountId: string;
  zephyrBaseUrl: string;
  zephyrProjectKey?: string;
}) => {
  return await api.post("/savezephyrconfig", config);
}

export const getZephyrTests = async (issueKey: string, projectKey?: string) => {
  const query = projectKey ? `?${new URLSearchParams({ projectKey }).toString()}` : "";
  return await api.get(`/getzephyrtests/${encodeURIComponent(issueKey)}${query}`);
}

export const checkZephyrIssues = async (issueKeys: string[], projectKey?: string) => {
  return await api.post("/checkzephyrissues", { issueKeys, projectKey });
}