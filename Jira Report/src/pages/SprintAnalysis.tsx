import { useEffect, useState, type ElementType } from "react";
import { useFilter } from "../context/FilterContext";
import { getSprintAnalysis, type SprintAnalysisData, type SprintData } from "../api/jira";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import {
  Zap,
  Target,
  TrendingUp,
  Calendar,
  CheckCircle2,
  Users,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "../utils/utils";

// ─── constants ───────────────────────────────────────────────────────────────

const STATE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  active: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Active" },
  closed: { bg: "bg-slate-100", text: "text-slate-600", label: "Closed" },
  future: { bg: "bg-blue-100", text: "text-blue-600", label: "Future" },
};

const TYPE_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#ef4444", // red
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#f97316", // orange
  "#06b6d4", // cyan
  "#ec4899", // pink
];

const AXIS_TICK = { fontSize: 11, fill: "#64748b" };
const TOOLTIP_STYLE = {
  fontSize: 12,
  backgroundColor: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
};

// ─── module-level cache + in-flight deduplication ────────────────────────────
// inflight ensures two renders requesting the same board share one network call
// instead of firing two (also dedupes React StrictMode's double-mount in dev).

const sprintCache: Record<string, SprintAnalysisData> = {};
const sprintInflight: Record<string, Promise<SprintAnalysisData>> = {};

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysRemaining(endDate: string | null): number | null {
  if (!endDate) return null;
  const now = new Date();
  const end = new Date(endDate);
  const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function sprintDurationDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
}

function sprintElapsedPct(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  const now = Date.now();
  if (now >= e) return 100;
  if (now <= s) return 0;
  return Math.round(((now - s) / (e - s)) * 100);
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: ElementType;
  iconColor: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {title}
          </span>
          <Icon className={cn("w-4 h-4", iconColor)} />
        </div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// ─── active sprint hero card ─────────────────────────────────────────────────

function ActiveSprintCard({ sprint }: { sprint: SprintData }) {
  const days = daysRemaining(sprint.endDate);
  const totalDays = sprintDurationDays(sprint.startDate, sprint.endDate);
  const elapsed = sprintElapsedPct(sprint.startDate, sprint.endDate);
  const progressPct = sprint.totalIssues > 0
    ? Math.round((sprint.doneCount / sprint.totalIssues) * 100)
    : 0;

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 overflow-hidden relative">
      {/* Decorative circle */}
      <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-emerald-100/40 blur-xl pointer-events-none" />
      <div className="absolute -right-2 -bottom-8 w-24 h-24 rounded-full bg-teal-100/30 blur-lg pointer-events-none" />

      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <CardTitle className="text-base font-bold text-gray-900">{sprint.name}</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {formatDate(sprint.startDate)} — {formatDate(sprint.endDate)}
                {totalDays && <span className="text-slate-400"> · {totalDays} days</span>}
              </p>
            </div>
          </div>
          <div className="text-right">
            {days !== null && days >= 0 ? (
              <div>
                <span className="text-2xl font-bold text-emerald-600">{days}</span>
                <span className="text-xs text-slate-500 ml-1">days left</span>
              </div>
            ) : days !== null ? (
              <span className="text-xs font-semibold text-red-500">Overdue by {Math.abs(days)}d</span>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {sprint.goal && (
          <p className="text-xs text-slate-600 bg-white/60 rounded-lg px-3 py-2 mb-4 border border-slate-100 italic">
            🎯 {sprint.goal}
          </p>
        )}

        {/* Timeline progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Sprint timeline</span>
            <span>{elapsed}% elapsed</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700"
              style={{ width: `${elapsed}%` }}
            />
          </div>
        </div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span className="text-[11px] text-slate-500 font-medium">Completion</span>
            </div>
            <div className="text-lg font-bold text-gray-900">{progressPct}%</div>
            <div className="w-full bg-slate-100 rounded-full h-1 mt-1 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <Target size={13} className="text-blue-500" />
              <span className="text-[11px] text-slate-500 font-medium">Issues</span>
            </div>
            <div className="text-lg font-bold text-gray-900">{sprint.doneCount}<span className="text-slate-400 font-normal text-sm">/{sprint.totalIssues}</span></div>
            <p className="text-[10px] text-slate-400 mt-0.5">{sprint.inProgressCount} in progress</p>
          </div>

          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp size={13} className="text-violet-500" />
              <span className="text-[11px] text-slate-500 font-medium">Points Done</span>
            </div>
            <div className="text-lg font-bold text-gray-900">{sprint.completedPoints}<span className="text-slate-400 font-normal text-sm">/{sprint.committedPoints}</span></div>
            <p className="text-[10px] text-slate-400 mt-0.5">story points</p>
          </div>

          <div className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <Users size={13} className="text-orange-500" />
              <span className="text-[11px] text-slate-500 font-medium">Team Size</span>
            </div>
            <div className="text-lg font-bold text-gray-900">{sprint.assigneeBreakdown.filter(a => a.name !== "Unassigned").length}</div>
            <p className="text-[10px] text-slate-400 mt-0.5">contributors</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── sprint history table ────────────────────────────────────────────────────

function SprintTable({
  sprints,
  expanded,
  onToggle,
}: {
  sprints: SprintData[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const shown = expanded ? sprints : sprints.slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar size={15} className="text-blue-500" />
            Sprint History
          </CardTitle>
          <span className="text-xs text-slate-400">{sprints.length} sprints</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5">Sprint</th>
                <th className="px-4 py-2.5">State</th>
                <th className="px-4 py-2.5">Dates</th>
                <th className="px-4 py-2.5 text-right">Issues</th>
                <th className="px-4 py-2.5 text-right">Points</th>
                <th className="px-4 py-2.5 text-right">Done %</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const badge = STATE_BADGE[s.state] ?? STATE_BADGE.closed;
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      "border-b last:border-0 hover:bg-gray-50 transition-colors",
                      s.state === "active" && "bg-emerald-50/40"
                    )}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[200px] truncate" title={s.name}>
                      {s.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", badge.bg, badge.text)}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {formatDate(s.startDate)} — {formatDate(s.endDate)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-bold text-gray-900">{s.doneCount}</span>
                      <span className="text-slate-400">/{s.totalIssues}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="font-bold text-gray-900">{s.completedPoints}</span>
                      <span className="text-slate-400">/{s.committedPoints}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${s.completionRate}%`,
                              backgroundColor: s.completionRate >= 80 ? "#22c55e" : s.completionRate >= 50 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <span className={cn(
                          "text-sm font-bold w-10 text-right",
                          s.completionRate >= 80 ? "text-green-600" : s.completionRate >= 50 ? "text-amber-600" : "text-red-500"
                        )}>
                          {s.completionRate}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sprints.length > 8 && (
          <button
            onClick={onToggle}
            className="w-full py-2 text-xs text-blue-500 font-medium hover:bg-blue-50/50 transition-colors flex items-center justify-center gap-1 border-t"
          >
            {expanded ? (
              <>Show Less <ChevronUp size={13} /></>
            ) : (
              <>Show All {sprints.length} Sprints <ChevronDown size={13} /></>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function SprintAnalysis() {
  const { selectedBoard } = useFilter();

  const [boardData, setBoardData] = useState<{ boardId: string; data: SprintAnalysisData } | null>(null);
  const [tableExpanded, setTableExpanded] = useState(false);

  // Derive loading/data from the board the loaded data belongs to. Tying the data
  // to its boardId guarantees that switching boards always shows the new board's
  // data (or a spinner) — never the previous board's — and removes any chance of a
  // stuck "loading" flag, which was the cause of data not refreshing on switch.
  const loading = !!selectedBoard && boardData?.boardId !== selectedBoard;
  const data = boardData?.boardId === selectedBoard ? boardData.data : null;

  useEffect(() => {
    if (!selectedBoard) return;

    let cancelled = false;

    const dataPromise: Promise<SprintAnalysisData> =
      sprintCache[selectedBoard]
        ? Promise.resolve(sprintCache[selectedBoard])
        : sprintInflight[selectedBoard] ??
          (sprintInflight[selectedBoard] = getSprintAnalysis(Number(selectedBoard))
            .then((res) => {
              const d = res?.data;
              sprintCache[selectedBoard] = d;
              return d;
            })
            .finally(() => {
              delete sprintInflight[selectedBoard];
            }));

    dataPromise
      .then((d) => {
        if (!cancelled) setBoardData({ boardId: selectedBoard, data: d });
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(err);
          setBoardData({ boardId: selectedBoard, data: { sprints: [], velocityChart: [] } });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBoard]);


  // Derived data
  const sprints = data?.sprints ?? [];
  const velocityChart = data?.velocityChart ?? [];
  const activeSprint = sprints.find((s) => s.state === "active");
  const closedSprints = sprints.filter((s) => s.state === "closed");

  const avgVelocity =
    closedSprints.length > 0
      ? Math.round(
          closedSprints.reduce((sum, s) => sum + s.completedPoints, 0) / closedSprints.length * 10
        ) / 10
      : 0;

  const avgCompletion =
    closedSprints.length > 0
      ? Math.round(
          closedSprints.reduce((sum, s) => sum + s.completionRate, 0) / closedSprints.length
        )
      : 0;

  // ─── empty / loading states ─────────────────────────────────────────────────

  if (!selectedBoard) {
    return (
      <div className="p-6 text-center text-gray-400 mt-20">
        <Zap size={40} className="mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No board selected</p>
        <p className="text-sm mt-1">Select a board from the top filter to view sprint analytics.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400 animate-pulse">Analyzing sprints...</p>
        </div>
      </div>
    );
  }

  if (sprints.length === 0 && !loading) {
    return (
      <div className="p-6 text-center text-gray-400 mt-20">
        <BarChart3 size={40} className="mx-auto mb-3 opacity-40" />
        <p className="text-lg font-medium">No sprints found</p>
        <p className="text-sm mt-1">This board doesn&apos;t have any sprints configured.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sprint Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">
            {sprints.length} sprints · {closedSprints.length} completed
          </p>
        </div>
        <div className="text-right text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          <p className="font-medium text-gray-600 text-sm">
            Avg Velocity: {avgVelocity} pts
          </p>
          <p>Avg Completion: {avgCompletion}%</p>
        </div>
      </div>

      {/* Active Sprint Hero Card */}
      {activeSprint && <ActiveSprintCard sprint={activeSprint} />}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Sprints"
          value={sprints.length}
          subtitle={`${closedSprints.length} closed`}
          icon={Calendar}
          iconColor="text-blue-600"
        />
        <StatCard
          title="Avg Velocity"
          value={`${avgVelocity} pts`}
          subtitle="per sprint (closed)"
          icon={TrendingUp}
          iconColor="text-violet-600"
        />
        <StatCard
          title="Avg Completion"
          value={`${avgCompletion}%`}
          subtitle="issue completion rate"
          icon={CheckCircle2}
          iconColor="text-emerald-600"
        />
        <StatCard
          title="Active Sprint"
          value={activeSprint ? activeSprint.name : "None"}
          subtitle={activeSprint ? `${activeSprint.doneCount}/${activeSprint.totalIssues} done` : "no active sprint"}
          icon={Zap}
          iconColor="text-amber-500"
        />
      </div>

      {/* Velocity Chart */}
      {velocityChart.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp size={15} className="text-violet-500" />
              Sprint Velocity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={velocityChart} margin={{ left: 0, right: 16, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={AXIS_TICK}
                  tickFormatter={(v: string) => (v.length > 14 ? v.slice(0, 12) + "…" : v)}
                />
                <YAxis tick={AXIS_TICK} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="committed" name="Committed" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Sprint History Table */}
      <SprintTable
        sprints={sprints}
        expanded={tableExpanded}
        onToggle={() => setTableExpanded(!tableExpanded)}
      />

      {/* Assignee Workload + Issue Type Breakdown (for active sprint) */}
      {activeSprint && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Assignee Workload */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users size={15} className="text-orange-500" />
                Assignee Workload
                <span className="text-xs font-normal text-slate-400 ml-1">(Active Sprint)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeSprint.assigneeBreakdown.length > 0 ? (
                <div className="space-y-2.5">
                  {activeSprint.assigneeBreakdown.map((a) => {
                    const maxPts = Math.max(...activeSprint.assigneeBreakdown.map(x => x.points), 1);
                    return (
                      <div key={a.name} className="flex items-center gap-3">
                        {a.avatar ? (
                          <img
                            src={a.avatar}
                            alt={a.name}
                            className="w-6 h-6 rounded-full shrink-0 border border-slate-200"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-slate-500">
                              {a.name.charAt(0)}
                            </span>
                          </div>
                        )}
                        <span className="text-sm text-gray-700 w-28 truncate" title={a.name}>
                          {a.name}
                        </span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full transition-all duration-500"
                            style={{ width: `${maxPts > 0 ? (a.points / maxPts) * 100 : 0}%` }}
                          />
                        </div>
                        <div className="text-right shrink-0 w-20">
                          <span className="text-sm font-bold text-gray-900">{a.points} pts</span>
                          <span className="text-xs text-slate-400 ml-1">({a.count})</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No assignee data</p>
              )}
            </CardContent>
          </Card>

          {/* Issue Type Breakdown */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 size={15} className="text-indigo-500" />
                Issue Types
                <span className="text-xs font-normal text-slate-400 ml-1">(Active Sprint)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeSprint.issueTypeBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={activeSprint.issueTypeBreakdown}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={AXIS_TICK} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={80}
                      tick={AXIS_TICK}
                      tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 10) + "…" : v)}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {activeSprint.issueTypeBreakdown.map((_, idx) => (
                        <Cell key={idx} fill={TYPE_COLORS[idx % TYPE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">No data</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* If no active sprint, show the most recent closed sprint's breakdowns */}
      {!activeSprint && closedSprints.length > 0 && (() => {
        const latest = closedSprints[0]; // Already sorted newest first
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users size={15} className="text-orange-500" />
                  Assignee Workload
                  <span className="text-xs font-normal text-slate-400 ml-1">({latest.name})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {latest.assigneeBreakdown.length > 0 ? (
                  <div className="space-y-2.5">
                    {latest.assigneeBreakdown.map((a) => {
                      const maxPts = Math.max(...latest.assigneeBreakdown.map(x => x.points), 1);
                      return (
                        <div key={a.name} className="flex items-center gap-3">
                          {a.avatar ? (
                            <img src={a.avatar} alt={a.name} className="w-6 h-6 rounded-full shrink-0 border border-slate-200" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-bold text-slate-500">{a.name.charAt(0)}</span>
                            </div>
                          )}
                          <span className="text-sm text-gray-700 w-28 truncate" title={a.name}>{a.name}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full transition-all duration-500"
                              style={{ width: `${maxPts > 0 ? (a.points / maxPts) * 100 : 0}%` }}
                            />
                          </div>
                          <div className="text-right shrink-0 w-20">
                            <span className="text-sm font-bold text-gray-900">{a.points} pts</span>
                            <span className="text-xs text-slate-400 ml-1">({a.count})</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">No assignee data</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 size={15} className="text-indigo-500" />
                  Issue Types
                  <span className="text-xs font-normal text-slate-400 ml-1">({latest.name})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {latest.issueTypeBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={latest.issueTypeBreakdown} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} />
                      <YAxis type="category" dataKey="name" width={80} tick={AXIS_TICK}
                        tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 10) + "…" : v)} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {latest.issueTypeBreakdown.map((_, idx) => (
                          <Cell key={idx} fill={TYPE_COLORS[idx % TYPE_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">No data</p>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}
