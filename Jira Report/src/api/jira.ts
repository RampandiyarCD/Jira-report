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
  return await api.get(`/getBoards/${projectKey}`);
}

export const getBoardIssues = async (boardId: number) => {
  return await api.get(`/getboardissues/${boardId}`);
}

export const getEpics = async (boardId: number) => {
  return await api.get(`/getepics/${boardId}`);
}

export const getEpicDetailsPage = async (epicKey: string, refresh = false) => {
  return await api.get(`/getepicdetailspage/${epicKey}${refresh ? "?refresh=true" : ""}`);
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
  return await api.get(`/getzephyrtests/${issueKey}${projectKey ? `?projectKey=${projectKey}` : ""}`);
}

export const checkZephyrIssues = async (issueKeys: string[], projectKey?: string) => {
  return await api.post("/checkzephyrissues", { issueKeys, projectKey });
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardData {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  openCount: number;
  statusChart: { name: string; count: number; category: string }[];
  statusTableData: { status: string; category: string; count: number; pct: number }[];
  issueTypeData: { name: string; count: number }[];
  priorityData: { name: string; count: number }[];
}

export const getDashboard = async (boardId: number): Promise<{ data: DashboardData & { success: boolean } }> => {
  return await api.get(`/dashboard/${boardId}`);
}