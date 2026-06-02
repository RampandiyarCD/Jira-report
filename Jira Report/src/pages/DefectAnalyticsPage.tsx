import { useEffect, useState, useCallback } from 'react'
import { useFilter } from '../context/FilterContext'
import { useNavigate } from 'react-router-dom'
import { getDefectAnalytics, type DefectAnalyticsData, type OpenIssue } from '../api/jira'
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, PieChart, Pie, Cell, type PieLabelRenderProps,
} from 'recharts'
import { Bug, AlertTriangle, Clock, TrendingDown, RefreshCw, Layers, X, User, ExternalLink } from 'lucide-react'
import { cn } from '../utils/utils'

// ─── chart constants ──────────────────────────────────────────────────────────

const AXIS_TICK     = { fontSize: 11, fill: '#64748b' }
const TOOLTIP_STYLE = { fontSize: 12, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }

const PRIORITY_COLOR: Record<string, string> = {
  Highest: '#ef4444',
  High:    '#f97316',
  Medium:  '#eab308',
  Low:     '#22c55e',
  Lowest:  '#94a3b8',
}

// ─── pie chart label renderers (module-level so they're stable references) ───
// Recharts maps the `nameKey` field ("priority") to `name` in label props.
// Using `name` avoids any custom-field type-casting issues.

const PIE_RADIAN = Math.PI / 180

// Data is pre-filtered to ≥ 5 % slices before reaching these renderers,
// so every slice that arrives here gets a label — no threshold check needed.

function renderPriorityLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, outerRadius, percent, name } = props
  const r = (Number(outerRadius) || 80) + 28
  const x = Number(cx) + r * Math.cos(-(midAngle ?? 0) * PIE_RADIAN)
  const y = Number(cy) + r * Math.sin(-(midAngle ?? 0) * PIE_RADIAN)
  const label = String(name ?? '')
  return (
    <text
      x={x} y={y}
      fill={PRIORITY_COLOR[label] ?? '#94a3b8'}
      textAnchor={x > Number(cx) ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
    >
      {`${label} ${Math.round((percent ?? 0) * 100)}%`}
    </text>
  )
}

function renderPriorityLabelLine(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, outerRadius, name } = props
  const r = Number(outerRadius) || 80
  const ang = -(midAngle ?? 0) * PIE_RADIAN
  const color = PRIORITY_COLOR[String(name ?? '')] ?? '#94a3b8'
  return (
    <line
      x1={Number(cx) + r * Math.cos(ang)}
      y1={Number(cy) + r * Math.sin(ang)}
      x2={Number(cx) + (r + 24) * Math.cos(ang)}
      y2={Number(cy) + (r + 24) * Math.sin(ang)}
      stroke={color}
      strokeWidth={1.5}
    />
  )
}

// ─── module-level cache ───────────────────────────────────────────────────────

const CACHE_TTL = 5 * 60 * 1000
type CacheEntry = { data: DefectAnalyticsData; expiresAt: number }
const defectCache: Record<string, CacheEntry> = {}
const defectInflight: Record<string, Promise<DefectAnalyticsData>> = {}

function cacheKey(boardId: string) {
  return `${localStorage.getItem('user_account_id') ?? 'anon'}::${boardId}`
}
function getCached(boardId: string): DefectAnalyticsData | null {
  const e = defectCache[cacheKey(boardId)]
  return e && e.expiresAt > Date.now() ? e.data : null
}
function setCached(boardId: string, data: DefectAnalyticsData) {
  defectCache[cacheKey(boardId)] = { data, expiresAt: Date.now() + CACHE_TTL }
}
function invalidate(boardId: string) {
  delete defectCache[cacheKey(boardId)]
  delete defectInflight[cacheKey(boardId)]
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color, onClick,
}: {
  label: string; value: string | number; sub: string
  icon: React.ElementType; color: string; onClick?: () => void
}) {
  return (
    <Card
      className={cn(onClick && 'cursor-pointer hover:shadow-md hover:ring-2 hover:ring-blue-100 transition-all')}
      onClick={onClick}
    >
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={cn('text-3xl font-bold mt-0.5', color)}>{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
          <Icon size={18} className={cn('mt-1', color.replace('-600', '-400'))} />
        </div>
        {onClick && (
          <p className="text-xs text-blue-500 mt-2">Click to view issues →</p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Bug detail modal ─────────────────────────────────────────────────────────

const AGE_COLOR = (d: number) =>
  d > 90 ? '#ef4444' : d > 30 ? '#f97316' : d > 7 ? '#eab308' : '#22c55e'

const jiraBase = () => localStorage.getItem('jira_base_url') ?? ''

function BugCardModal({
  title, issues, onClose,
}: { title: string; issues: OpenIssue[]; onClose: () => void }) {
  const navigate = useNavigate()
  const base = jiraBase()

  const openDetail = (key: string) => {
    onClose()
    navigate(`/defects/${key}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* slide-in panel */}
      <div className="relative z-10 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{issues.length} issues shown (last 90 days)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* scrollable list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {issues.length === 0 && (
            <p className="text-center text-gray-400 py-12 text-sm">No open issues found in the last 90 days.</p>
          )}
          {issues.map((bug) => (
            <div
              key={bug.key}
              onClick={() => openDetail(bug.key)}
              className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-blue-200 cursor-pointer transition-all"
            >
              {/* top row: key + external link + age badge */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {bug.key}
                  </span>
                  <a
                    href={`${base}/browse/${bug.key}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-gray-300 hover:text-blue-500 transition-colors"
                    title="Open in Jira"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: AGE_COLOR(bug.ageDays) }}
                >
                  {bug.ageDays}d old
                </span>
              </div>

              {/* summary */}
              <p className="text-sm font-medium text-gray-800 leading-snug mb-3">{bug.summary}</p>

              {/* bottom row: priority · status · assignee */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: PRIORITY_COLOR[bug.priority] ?? '#94a3b8' }}
                >
                  {bug.priority}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {bug.status}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-gray-500 ml-auto">
                  <User size={11} />
                  {bug.assignee}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AgingBar({ label, count, color, max }: { label: string; count: number; color: string; max: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-sm text-gray-600 w-24">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${max ? (count / max) * 100 : 0}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export function DefectAnalyticsPage() {
  const { selectedBoard } = useFilter()
  const navigate = useNavigate()
  const [data, setData] = useState<DefectAnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [modal, setModal] = useState<{ title: string; issues: OpenIssue[] } | null>(null)

  const fetchData = useCallback((boardId: string, bust = false) => {
    if (bust) invalidate(boardId)
    const key = cacheKey(boardId)
    const cached = getCached(boardId)
    return cached
      ? Promise.resolve(cached)
      : defectInflight[key] ??
        (defectInflight[key] = getDefectAnalytics(Number(boardId))
          .then((res) => { const d = res.data; setCached(boardId, d); return d })
          .finally(() => { delete defectInflight[key] }))
  }, [])

  useEffect(() => {
    if (!selectedBoard) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const d = await fetchData(selectedBoard)
        if (!cancelled) setData(d)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [selectedBoard, fetchData])

  const handleRefresh = useCallback(() => {
    if (!selectedBoard || refreshing) return
    setRefreshing(true)
    fetchData(selectedBoard, true)
      .then((d) => setData(d))
      .catch(console.error)
      .finally(() => setRefreshing(false))
  }, [selectedBoard, refreshing, fetchData])

  if (!selectedBoard) {
    return (
      <div className="p-6 text-center text-gray-400 mt-20">
        <Bug size={40} className="mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No board selected</p>
        <p className="text-sm mt-1">Select a board from the top filter to view defect analytics.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-slate-400 animate-pulse">Loading defect analytics...</p>
      </div>
    )
  }

  if (!data) return null

  const agingMax = Math.max(...data.aging.map((a) => a.count), 1)
  const assigneeMax = Math.max(...data.byAssignee.map((a) => a.open + a.resolved), 1)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Defect Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">Bug density, resolution time, aging & team workload</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh"
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
        >
          <RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Open Bugs" value={data.openBugs}
          sub={`${data.resolvedBugs} resolved · ${data.totalBugs} total`}
          icon={Bug} color="text-red-600"
          onClick={() => setModal({
            title: 'Open Bugs',
            issues: data.openIssuesList ?? [],
          })} />
        <KpiCard label="Critical / High Open" value={data.critHighOpen}
          sub="needs immediate attention"
          icon={AlertTriangle} color="text-orange-600"
          onClick={() => setModal({
            title: 'Critical & High Priority Open Bugs',
            issues: (data.openIssuesList ?? []).filter(
              (i) => i.priority === 'Highest' || i.priority === 'High',
            ),
          })} />
        <KpiCard label="Avg Resolution" value={`${data.avgResolutionDays}d`}
          sub="days to fix (last 90 days)"
          icon={Clock} color="text-blue-600" />
        <KpiCard label="Escape / Reopen Rate" value={`${data.escapeRate}%`}
          sub="bugs reopened after close"
          icon={TrendingDown} color="text-purple-600" />
      </div>

      {modal && (
        <BugCardModal
          title={modal.title}
          issues={modal.issues}
          onClose={() => setModal(null)}
        />
      )}

      {/* Trend + Priority pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bug Trend — Created vs Resolved (12 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.trend} margin={{ top: 4, right: 8, left: -10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="week"
                  interval={0}
                  angle={-40}
                  textAnchor="end"
                  tick={{ fontSize: 10, fill: '#64748b' }}
                  tickLine={false}
                  height={55}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  domain={[0, 'auto']}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
                <Bar dataKey="created"  name="Created"  fill="#ef4444" radius={[4,4,0,0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#22c55e" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Bugs by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Pre-filter: only include slices that are ≥ 5 % of the total.
              // Removing tiny slices from the data entirely is the only reliable
              // way to prevent Recharts rendering stray labels for them.
              const total = data.byPriority.reduce((s, p) => s + p.count, 0)
              const pieData = data.byPriority.filter(
                p => p.count > 0 && total > 0 && p.count / total >= 0.05,
              )
              return (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart margin={{ top: 20, right: 50, bottom: 20, left: 50 }}>
                    <Pie
                      data={pieData}
                      dataKey="count"
                      nameKey="priority"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                      label={renderPriorityLabel}
                      labelLine={renderPriorityLabelLine}
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={idx} fill={PRIORITY_COLOR[entry.priority] ?? '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value) => {
                        const n = Number(value ?? 0)
                        return [`${n} ${n === 1 ? 'bug' : 'bugs'}`]
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Resolution time by priority + Bug aging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Avg Resolution Time by Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.byPriority.filter(p => p.count > 0).map(({ priority, count, openCount, avgDays }) => (
                <div key={priority} className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: PRIORITY_COLOR[priority] ?? '#94a3b8' }} />
                  <span className="text-sm text-gray-700 w-16 truncate">{priority}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (avgDays / 30) * 100)}%`,
                               backgroundColor: PRIORITY_COLOR[priority] ?? '#94a3b8' }} />
                  </div>
                  <span className="text-sm font-semibold w-12 text-right">{avgDays}d</span>
                  <span className="text-xs text-gray-400 w-20 text-right">{openCount}/{count} open</span>
                </div>
              ))}
              {data.byPriority.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No bug data in the last 90 days</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Open Bug Aging</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.aging.map((a) => (
              <AgingBar key={a.label} label={a.label} count={a.count} color={a.color} max={agingMax} />
            ))}
            <p className="text-xs text-gray-400 pt-1">
              Bugs open longer than 90 days are often forgotten — consider triage.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Assignee workload */}
      {data.byAssignee.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers size={15} className="text-slate-400" />
              Assignee Workload (open vs resolved)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {data.byAssignee.map(({ name, open, resolved }) => {
                const pct = Math.round((open / assigneeMax) * 100)
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-32 truncate" title={name}>{name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden flex">
                      <div className="h-full bg-red-400 rounded-l-full transition-all"
                        style={{ width: `${pct}%` }} />
                      <div className="h-full bg-green-400 rounded-r-full transition-all"
                        style={{ width: `${Math.round((resolved / assigneeMax) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-red-500 font-semibold w-10 text-right">{open} open</span>
                    <span className="text-xs text-green-600 w-14 text-right">{resolved} fixed</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Oldest open bugs table */}
      {data.oldestBugs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle size={15} className="text-orange-400" />
              Oldest Unresolved Bugs
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-2">Key</th>
                  <th className="px-4 py-2">Summary</th>
                  <th className="px-4 py-2">Priority</th>
                  <th className="px-4 py-2">Assignee</th>
                  <th className="px-4 py-2 text-right">Age</th>
                </tr>
              </thead>
              <tbody>
                {data.oldestBugs.map((bug) => (
                  <tr
                    key={bug.key}
                    className="border-b last:border-0 hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/defects/${bug.key}`)}
                  >
                    <td className="px-4 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-blue-600">{bug.key}</span>
                        <a
                          href={`${jiraBase()}/browse/${bug.key}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-gray-300 hover:text-blue-500 transition-colors"
                          title="Open in Jira"
                        >
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-gray-800 max-w-xs truncate" title={bug.summary}>{bug.summary}</td>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-0.5 rounded-full text-white text-xs font-medium"
                        style={{ backgroundColor: PRIORITY_COLOR[bug.priority] ?? '#94a3b8' }}>
                        {bug.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{bug.assignee}</td>
                    <td className={cn('px-4 py-2 text-right font-semibold', bug.ageDays > 90 ? 'text-red-600' : bug.ageDays > 30 ? 'text-orange-500' : 'text-gray-700')}>
                      {bug.ageDays}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
