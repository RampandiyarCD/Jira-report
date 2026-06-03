import axios, { type AxiosInstance } from "axios";

export const api: AxiosInstance = axios.create({
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
  return await api.get("/getprojects");
}

export const getBoards = async (projectKey: string) => {
  return await api.get(`/getboards/${encodeURIComponent(projectKey)}`);
}

export const getEpics = async (boardId: number, dateFrom?: string, dateTo?: string) => {
  const p = new URLSearchParams();
  if (dateFrom) p.set("from", dateFrom);
  if (dateTo) p.set("to", dateTo);
  return await api.get(`/getepics/${boardId}${p.toString() ? `?${p}` : ""}`);
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

export const getDashboard = async (boardId: number, dateFrom?: string, dateTo?: string): Promise<{ data: DashboardData & { success: boolean } }> => {
  const p = new URLSearchParams();
  if (dateFrom) p.set("from", dateFrom);
  if (dateTo) p.set("to", dateTo);
  return await api.get(`/dashboard/${boardId}${p.toString() ? `?${p}` : ""}`);
}

// ─── Sprint Analysis ─────────────────────────────────────────────────────────

export interface SprintData {
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
  assigneeBreakdown: { name: string; avatar: string; count: number; points: number }[];
  issueTypeBreakdown: { name: string; count: number }[];
}

export interface SprintAnalysisData {
  sprints: SprintData[];
  velocityChart: { name: string; committed: number; completed: number }[];
}

export const getSprintAnalysis = async (boardId: number): Promise<{ data: SprintAnalysisData & { success: boolean } }> => {
  return await api.get(`/sprintanalysis/${boardId}`);
}