import axios, { Axios } from "axios";
import type { AxiosResponse } from "axios";

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const apiCache = new Map<string, { data: AxiosResponse<any>; timestamp: number }>();

function getCached(key: string): AxiosResponse<any> | null {
  const entry = apiCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  return null;
}

function setCache(key: string, data: AxiosResponse<any>) {
  apiCache.set(key, { data, timestamp: Date.now() });
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
  return await api.get("/getProjects");
}

export const getBoards = async (projectKey: string) => {
  return await api.get(`/getBoards/${projectKey}`);
}

export const getBoardIssues = async (boardId: number) => {
  return await api.get(`/getboardissues/${boardId}`);
}

export const getEpics = async (boardId: number) => {
  const cacheKey = `epics_board_${boardId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const result = await api.get(`/getepics/${boardId}`);
  setCache(cacheKey, result);
  return result;
}

export const getEpicsAll = async (projectKey?: string) => {
  return await api.get(`/getepics`, {
    params: projectKey ? { projectKey } : undefined,
  });
}

export const getBoardStats = async (options?: { boardId?: number; projectKey?: string }) => {
  const cacheKey = options?.boardId != null
    ? `boardstats_board_${options.boardId}`
    : options?.projectKey
      ? `boardstats_project_${options.projectKey}`
      : `boardstats_all`;

  const cached = getCached(cacheKey);
  if (cached) return cached;

  let result: AxiosResponse<any>;
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