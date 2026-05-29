import { useEffect, useState, type ElementType } from 'react'
import { useFilter } from '../context/FilterContext'
import { getDashboard, type DashboardData } from '../api/jira'
import { Card, CardContent, CardHeader, CardTitle } from '../components/Card'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Layers, CheckCircle2, Clock, Circle, AlertTriangle } from 'lucide-react'
import { cn } from '../utils/utils'

// ─── constants ───────────────────────────────────────────────────────────────

const STATUS_CAT_COLOR: Record<string, string> = {
  'To Do': '#94a3b8',
  'In Progress': '#3b82f6',
  Done: '#22c55e',
}

const PRIORITY_COLOR: Record<string, string> = {
  Highest: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#22c55e',
  Lowest: '#94a3b8',
}

const AXIS_TICK = { fontSize: 11, fill: '#64748b' }
const TOOLTIP_STYLE = {
  fontSize: 12,
  backgroundColor: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
}

// ─── module-level cache + in-flight deduplication ────────────────────────────
// inflight ensures that two renders requesting the same board at the same time
// share one network call instead of firing two.

const dashboardCache: Record<string, DashboardData> = {}
const dashboardInflight: Record<string, Promise<DashboardData>> = {}

// ─── stat card ────────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
}: {
  title: string
  value: number
  subtitle: string
  icon: ElementType
  iconColor: string
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {title}
          </span>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </CardContent>
    </Card>
  )
}

// ─── status breakdown table ───────────────────────────────────────────────────

function StatusTable({ rows }: { rows: DashboardData['statusTableData'] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Issues by Status</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2 text-right">Count</th>
              <th className="px-4 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.status} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{r.status}</td>
                <td className="px-4 py-2">
                  <span
                    className="inline-block px-2 py-0.5 rounded-full text-white text-xs font-medium"
                    style={{ backgroundColor: STATUS_CAT_COLOR[r.category] ?? '#94a3b8' }}
                  >
                    {r.category}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-bold text-gray-900">{r.count}</td>
                <td className="px-4 py-2 text-right text-gray-500">{r.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { selectedBoard } = useFilter()

  const [boardData, setBoardData] = useState<{ boardId: string; data: DashboardData } | null>(null)

  const loading = !!selectedBoard && boardData?.boardId !== selectedBoard
  const data = boardData?.boardId === selectedBoard ? boardData.data : null

  useEffect(() => {
    if (!selectedBoard) return

    let cancelled = false

    const dataPromise: Promise<DashboardData> =
      dashboardCache[selectedBoard]
        ? Promise.resolve(dashboardCache[selectedBoard])
        : dashboardInflight[selectedBoard] ??
          (dashboardInflight[selectedBoard] = getDashboard(Number(selectedBoard))
            .then((res) => {
              const d = res?.data
              dashboardCache[selectedBoard] = d
              return d
            })
            .finally(() => {
              delete dashboardInflight[selectedBoard]
            }))

    dataPromise
      .then((d) => {
        if (!cancelled) setBoardData({ boardId: selectedBoard, data: d })
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err)
          setBoardData({
            boardId: selectedBoard,
            data: { total: 0, todo: 0, inProgress: 0, done: 0, openCount: 0, statusChart: [], statusTableData: [], issueTypeData: [], priorityData: [] },
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedBoard])

  const stats = { total: data?.total ?? 0, todo: data?.todo ?? 0, inProgress: data?.inProgress ?? 0, done: data?.done ?? 0 }
  const statusChartData = data?.statusChart ?? []
  const issueTypeData = data?.issueTypeData ?? []
  const priorityData = data?.priorityData ?? []

  if (!selectedBoard) {
    return (
      <div className="p-6 text-center text-gray-400 mt-20">
        <Layers size={40} className="mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No board selected</p>
        <p className="text-sm mt-1">Select a board from the top filter to view its overview.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-slate-400 animate-pulse">Loading board data...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Board Overview</h1>
          <p className="text-gray-500 text-sm mt-1">Board ID: {selectedBoard}</p>
        </div>
        <div className="text-right text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          <p className="font-medium text-gray-600 text-sm">{stats.total} total issues</p>
          <p>{data?.openCount ?? 0} open</p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Issues"
          value={stats.total}
          subtitle="all statuses"
          icon={Layers}
          iconColor="text-gray-700"
        />
        <StatCard
          title="To Do"
          value={stats.todo}
          subtitle={`${stats.total ? Math.round((stats.todo / stats.total) * 100) : 0}% of total`}
          icon={Circle}
          iconColor="text-slate-500"
        />
        <StatCard
          title="In Progress"
          value={stats.inProgress}
          subtitle={`${stats.total ? Math.round((stats.inProgress / stats.total) * 100) : 0}% of total`}
          icon={Clock}
          iconColor="text-blue-600"
        />
        <StatCard
          title="Done"
          value={stats.done}
          subtitle={`${stats.total ? Math.round((stats.done / stats.total) * 100) : 0}% of total`}
          icon={CheckCircle2}
          iconColor="text-green-600"
        />
      </div>

      {/* Status chart + table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Cards per Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={AXIS_TICK}
                  tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 16) + '…' : v)}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {statusChartData.map((entry, idx) => (
                    <Cell key={idx} fill={STATUS_CAT_COLOR[entry.category] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <StatusTable rows={data?.statusTableData ?? []} />
      </div>

      {/* Issue type + Priority breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By Issue Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {issueTypeData.map(({ name, count }) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-32 truncate" title={name}>
                    {name}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full"
                      style={{
                        width: `${stats.total ? Math.round((count / stats.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-8 text-right">
                    {count}
                  </span>
                </div>
              ))}
              {issueTypeData.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No data</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle size={15} className="text-orange-400" />
              By Priority
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {priorityData.map(({ name, count }) => (
                <div key={name} className="flex items-center gap-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: PRIORITY_COLOR[name] ?? '#94a3b8' }}
                  />
                  <span className="text-sm text-gray-700 w-28 truncate" title={name}>
                    {name}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${stats.total ? Math.round((count / stats.total) * 100) : 0}%`,
                        backgroundColor: PRIORITY_COLOR[name] ?? '#94a3b8',
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-8 text-right">
                    {count}
                  </span>
                </div>
              ))}
              {priorityData.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No data</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
