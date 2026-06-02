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

// ─── Defect Analytics ─────────────────────────────────────────────────────────

export interface DefectPriority { priority: string; count: number; openCount: number; avgDays: number }
export interface DefectAssignee { name: string; open: number; resolved: number }
export interface DefectBug      { key: string; summary: string; priority: string; ageDays: number; assignee: string }
export interface OpenIssue      { key: string; summary: string; priority: string; status: string; ageDays: number; assignee: string }

export interface DefectAnalyticsData {
  totalBugs: number; openBugs: number; resolvedBugs: number;
  critHighOpen: number; avgResolutionDays: number; escapeRate: number;
  byPriority: DefectPriority[];
  trend: { week: string; created: number; resolved: number }[];
  aging: { label: string; count: number; color: string }[];
  byAssignee: DefectAssignee[];
  oldestBugs: DefectBug[];
  openIssuesList: OpenIssue[];
}

export const getDefectAnalytics = async (boardId: number): Promise<{ data: DefectAnalyticsData & { success: boolean } }> => {
  return await api.get(`/defect-analytics/${boardId}`);
}

// ─── Single Issue ─────────────────────────────────────────────────────────────

export interface IssueComment { author: string; avatarUrl: string; body: string; created: string }
export interface IssueStatusHistory { from: string; to: string; author: string; date: string }

export interface IssueDetail {
  key: string; summary: string; description: string;
  status: string; statusCategoryKey: string; statusCategoryName: string;
  priority: string; issueType: string;
  assignee: { displayName: string; avatarUrl: string } | null;
  reporter: { displayName: string; avatarUrl: string } | null;
  created: string | null; updated: string | null; resolutionDate: string | null;
  labels: string[]; components: string[];
  storyPoints: number | null;
  statusHistory: IssueStatusHistory[];
  comments: IssueComment[];
}

export const getIssue = async (issueKey: string): Promise<{ data: IssueDetail & { success: boolean } }> => {
  return await api.get(`/issue/${encodeURIComponent(issueKey)}`);
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