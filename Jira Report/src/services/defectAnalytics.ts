import { api } from '../api/jira'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000
type CacheEntry = { data: DefectAnalyticsData; expiresAt: number }
const cache: Record<string, CacheEntry> = {}
const inflight: Record<string, Promise<DefectAnalyticsData>> = {}

function cacheKey(boardId: string): string {
  return `${localStorage.getItem('user_account_id') ?? 'anon'}::${boardId}`
}

function getCached(boardId: string): DefectAnalyticsData | null {
  const e = cache[cacheKey(boardId)]
  return e && e.expiresAt > Date.now() ? e.data : null
}

function setCached(boardId: string, data: DefectAnalyticsData): void {
  cache[cacheKey(boardId)] = { data, expiresAt: Date.now() + CACHE_TTL }
}

export function invalidateDefectCache(boardId: string): void {
  const key = cacheKey(boardId)
  delete cache[key]
  delete inflight[key]
}

// ─── Issue Detail Types ───────────────────────────────────────────────────────

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
  return api.get(`/issue/${encodeURIComponent(issueKey)}`)
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export function fetchDefectAnalytics(boardId: string, bust = false): Promise<DefectAnalyticsData> {
  if (bust) invalidateDefectCache(boardId)
  const cached = getCached(boardId)
  if (cached) return Promise.resolve(cached)
  const key = cacheKey(boardId)
  return (
    inflight[key] ??
    (inflight[key] = api
      .get<DefectAnalyticsData & { success: boolean }>(`/defect-analytics/${boardId}`)
      .then((res) => { setCached(boardId, res.data); return res.data })
      .finally(() => { delete inflight[key] }))
  )
}
