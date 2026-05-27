import axios, { Axios } from "axios";
import type { AxiosResponse } from "axios";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes (dynamic data: stats, issues)
const STABLE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes (stable data: projects, boards, epics)
const DETAILS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (slow detailed breakdowns)
const DETAILS_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const apiCache = new Map<string, { data: AxiosResponse<unknown>; timestamp: number; ttl: number }>();

function getCached(key: string): AxiosResponse<unknown> | null {
  const entry = apiCache.get(key);
  if (entry && Date.now() - entry.timestamp < entry.ttl) {
    return entry.data;
  }
  return null;
}

function setCache(key: string, data: AxiosResponse<unknown>, ttl = CACHE_TTL) {
  apiCache.set(key, { data, timestamp: Date.now(), ttl });
}

export const clearApiCache = () => apiCache.clear();

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
  const cacheKey = "projects_list";
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const result = await api.get("/getProjects");
  setCache(cacheKey, result, STABLE_CACHE_TTL);
  return result;
}

export const getBoards = async (projectKey: string) => {
  const cacheKey = `boards_project_${projectKey}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const result = await api.get(`/getBoards/${projectKey}`);
  setCache(cacheKey, result, STABLE_CACHE_TTL);
  return result;
}

export const getBoardIssues = async (boardId: number) => {
  return await api.get(`/getboardissues/${boardId}`);
}

export const getEpics = async (boardId: number) => {
  const cacheKey = `epics_board_${boardId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const result = await api.get(`/getepics/${boardId}`);
  setCache(cacheKey, result, STABLE_CACHE_TTL);
  return result;
}

export const getBoardIssueSummary = async (options?: { boardId?: number; projectKey?: string }) => {
  const cacheKey = options?.boardId != null
    ? `issuessummary_board_${options.boardId}`
    : options?.projectKey
      ? `issuessummary_project_${options.projectKey}`
      : `issuessummary_all`;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  let result: AxiosResponse<unknown>;
  if (options?.boardId != null) {
    result = await api.get(`/getboardissuessummary/${options.boardId}`);
  } else {
    result = await api.get(`/getboardissuessummary`, {
      params: options?.projectKey ? { projectKey: options.projectKey } : undefined,
    });
  }
  setCache(cacheKey, result);
  return result;
}
export const getEpicsAll = async (projectKey?: string) => {
  const cacheKey = projectKey ? `epicsall_project_${projectKey}` : `epicsall_all`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const result = await api.get(`/getepics`, {
    params: projectKey ? { projectKey } : undefined,
  });
  setCache(cacheKey, result, STABLE_CACHE_TTL);
  return result;
}

export const getBoardStats = async (options?: { boardId?: number; projectKey?: string }) => {
  const cacheKey = options?.boardId != null
    ? `boardstats_board_${options.boardId}`
    : options?.projectKey
      ? `boardstats_project_${options.projectKey}`
      : `boardstats_all`;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  let result: AxiosResponse<unknown>;
  if (options?.boardId != null) {
    result = await api.get(`/getboardstats/${options.boardId}`);
  } else {
    result = await api.get(`/getboardstats`, {
      params: options?.projectKey ? { projectKey: options.projectKey } : undefined,
    });
  }
  setCache(cacheKey, result);
  return result;
}

export const getBoardStatsDetails = async (options?: { boardId?: number; projectKey?: string }) => {
  const cacheKey = options?.boardId != null
    ? `boardstatsdetails_board_${options.boardId}`
    : options?.projectKey
      ? `boardstatsdetails_project_${options.projectKey}`
      : `boardstatsdetails_all`;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  let result: AxiosResponse<unknown>;
  if (options?.boardId != null) {
    result = await api.get(`/getboardstatsdetails/${options.boardId}`, {
      timeout: DETAILS_TIMEOUT_MS,
    });
  } else {
    result = await api.get(`/getboardstatsdetails`, {
      params: options?.projectKey ? { projectKey: options.projectKey } : undefined,
      timeout: DETAILS_TIMEOUT_MS,
    });
  }
  setCache(cacheKey, result, DETAILS_CACHE_TTL);
  return result;
}
