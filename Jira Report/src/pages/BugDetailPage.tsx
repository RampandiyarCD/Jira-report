import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getIssue, type IssueDetail } from '../api/jira'
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card'
import {
  ArrowLeft, User, Calendar, Tag, AlertTriangle,
  CheckCircle2, Clock, Circle, ExternalLink,
} from 'lucide-react'
import { cn } from '../utils/utils'

// ─── helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<string, string> = {
  Highest: 'bg-red-100 text-red-700',
  High:    'bg-orange-100 text-orange-700',
  Medium:  'bg-yellow-100 text-yellow-700',
  Low:     'bg-green-100 text-green-700',
  Lowest:  'bg-slate-100 text-slate-600',
}

const PRIORITY_DOT: Record<string, string> = {
  Highest: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e', Lowest: '#94a3b8',
}

function fmt(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtFull(d: string | null | undefined) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function StatusIcon({ catKey }: { catKey: string }) {
  if (catKey === 'done') return <CheckCircle2 size={14} className="text-green-500" />
  if (catKey === 'indeterminate') return <Clock size={14} className="text-blue-500" />
  return <Circle size={14} className="text-slate-400" />
}

function StatusBadge({ name, catKey }: { name: string; catKey: string }) {
  const cls =
    catKey === 'done'          ? 'bg-green-50 text-green-700 ring-green-600/20'
    : catKey === 'indeterminate' ? 'bg-blue-50 text-blue-700 ring-blue-600/20'
    : 'bg-slate-50 text-slate-600 ring-slate-500/10'
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset', cls)}>
      <StatusIcon catKey={catKey} />
      {name}
    </span>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export function BugDetailPage() {
  const { issueKey } = useParams<{ issueKey: string }>()
  const navigate = useNavigate()
  const [issue, setIssue] = useState<IssueDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!issueKey) return
    setLoading(true)
    setError(null)
    getIssue(issueKey)
      .then((res) => setIssue(res.data))
      .catch((err) => setError(err?.response?.data?.message ?? 'Failed to load issue'))
      .finally(() => setLoading(false))
  }, [issueKey])

  const jiraUrl = localStorage.getItem('jira_base_url') ?? ''

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-slate-400 animate-pulse">Loading issue...</p>
      </div>
    )
  }

  if (error || !issue) {
    return (
      <div className="p-6 text-center text-gray-400 mt-20">
        <AlertTriangle size={40} className="mx-auto mb-3 text-orange-300" />
        <p className="text-base font-medium text-gray-700">{error ?? 'Issue not found'}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-blue-600 hover:underline">
          ← Go back
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      {/* Back + header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate(-1)}
          className="mt-1 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <a
              href={`${jiraUrl}/browse/${issue.key}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-sm font-bold text-blue-600 hover:underline"
            >
              {issue.key}
              <ExternalLink size={12} />
            </a>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
              {issue.issueType}
            </span>
            <StatusBadge name={issue.status} catKey={issue.statusCategoryKey} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 leading-snug">{issue.summary}</h1>
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Priority */}
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Priority</p>
            <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full', PRIORITY_COLOR[issue.priority] ?? 'bg-slate-100 text-slate-600')}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PRIORITY_DOT[issue.priority] ?? '#94a3b8' }} />
              {issue.priority}
            </span>
          </CardContent>
        </Card>

        {/* Assignee */}
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Assignee</p>
            <div className="flex items-center gap-1.5">
              {issue.assignee?.avatarUrl
                ? <img src={issue.assignee.avatarUrl} className="w-5 h-5 rounded-full" alt="" />
                : <User size={14} className="text-slate-400" />}
              <span className="text-sm text-gray-700 truncate">{issue.assignee?.displayName ?? 'Unassigned'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Reporter */}
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Reporter</p>
            <div className="flex items-center gap-1.5">
              {issue.reporter?.avatarUrl
                ? <img src={issue.reporter.avatarUrl} className="w-5 h-5 rounded-full" alt="" />
                : <User size={14} className="text-slate-400" />}
              <span className="text-sm text-gray-700 truncate">{issue.reporter?.displayName ?? '—'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Story points */}
        {issue.storyPoints != null && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Story Points</p>
              <p className="text-lg font-bold text-gray-800">{issue.storyPoints}</p>
            </CardContent>
          </Card>
        )}

        {/* Created */}
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Created</p>
            <div className="flex items-center gap-1 text-sm text-gray-700">
              <Calendar size={13} className="text-slate-400" />
              {fmt(issue.created)}
            </div>
          </CardContent>
        </Card>

        {/* Updated */}
        <Card>
          <CardContent className="pt-3 pb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Updated</p>
            <div className="flex items-center gap-1 text-sm text-gray-700">
              <Calendar size={13} className="text-slate-400" />
              {fmt(issue.updated)}
            </div>
          </CardContent>
        </Card>

        {/* Resolved */}
        {issue.resolutionDate && (
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Resolved</p>
              <div className="flex items-center gap-1 text-sm text-green-700">
                <CheckCircle2 size={13} />
                {fmt(issue.resolutionDate)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Labels + components */}
      {(issue.labels.length > 0 || issue.components.length > 0) && (
        <Card>
          <CardContent className="pt-4 pb-4 flex flex-wrap gap-3">
            {issue.labels.map((l) => (
              <span key={l} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                <Tag size={10} />{l}
              </span>
            ))}
            {issue.components.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                {c}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Description */}
      {issue.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{issue.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Status history */}
      {issue.statusHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[...issue.statusHistory].reverse().map((h, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="mt-0.5 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <Clock size={12} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-gray-500 line-through text-xs">{h.from}</span>
                  <span className="mx-1.5 text-gray-400">→</span>
                  <span className="font-semibold text-gray-800">{h.to}</span>
                  <span className="ml-2 text-xs text-gray-400">by {h.author}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{fmtFull(h.date)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Comments */}
      {issue.comments.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Comments ({issue.comments.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {issue.comments.map((c, i) => (
              <div key={i} className="flex gap-3">
                {c.avatarUrl
                  ? <img src={c.avatarUrl} className="w-7 h-7 rounded-full shrink-0 mt-0.5" alt="" />
                  : <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                      <User size={14} className="text-slate-500" />
                    </div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-800">{c.author}</span>
                    <span className="text-xs text-gray-400">{fmtFull(c.created)}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-slate-50 rounded-lg px-3 py-2">
                    {c.body || <em className="text-gray-400">No text content</em>}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
