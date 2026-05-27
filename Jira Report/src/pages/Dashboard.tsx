import { useEffect, useMemo, useState } from "react";
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { BarChart2, List, Clock, CheckCircle2, AlertTriangle, Layers, LayoutDashboard } from "lucide-react";
import { getBoardStats, getBoardStatsDetails, getBoards } from "../api/jira";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";

interface StatusBreakdownValue {
  count: number;
  category: string;
}

interface DashboardStats {
  totalIssues: number;
  todoCount: number;
  inProgressCount: number;
  doneCount: number;
  statusBreakdown: Record<string, StatusBreakdownValue | number>;
  issueTypeBreakdown?: Record<string, number>;
  priorityBreakdown?: Record<string, number>;
}

interface BreakdownRow {
  name: string;
  count: number;
  category?: string;
}

const EMPTY_STATS: DashboardStats = {
  totalIssues: 0,
  todoCount: 0,
  inProgressCount: 0,
  doneCount: 0,
  statusBreakdown: {},
  issueTypeBreakdown: {},
  priorityBreakdown: {},
};

const STATUS_CAT_COLOR: Record<string, string> = {
  "To Do": "#94a3b8",
  "In Progress": "#3b82f6",
  Done: "#22c55e",
};

const PRIORITY_COLOR: Record<string, string> = {
  Highest: "#ef4444",
  High: "#f97316",
  Medium: "#eab308",
  Low: "#22c55e",
  Lowest: "#94a3b8",
};

const COLOR_PALETTE = [
  "#4361ee", "#3a0ca3", "#7209b7", "#8338ec",
  "#f72585", "#b5179e", "#e63946", "#ff4d6d",
  "#fb8500", "#ffb703", "#ffd60a", "#e9c46a",
  "#06d6a0", "#40916c", "#52b788", "#2dc653",
  "#4cc9f0", "#0096c7", "#48cae4", "#0077b6",
  "#3a86ff", "#118ab2", "#ef476f", "#f4a261",
  "#457b9d", "#264653", "#6a4c93", "#ff595e",
  "#8ac926", "#1982c4", "#ffca3a", "#c77dff",
];

function pickColor(key: string, overrides?: Record<string, string>): string {
  if (overrides?.[key]) return overrides[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

function breakdownToRows(
  breakdown: Record<string, StatusBreakdownValue | number> | undefined
): BreakdownRow[] {
  return Object.entries(breakdown ?? {})
    .map(([name, value]) => {
      if (typeof value === "number") return { name, count: value };
      return { name, count: value.count, category: value.category };
    })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

function countMapToRows(breakdown: Record<string, number> | undefined): BreakdownRow[] {
  return Object.entries(breakdown ?? {})
    .map(([name, count]) => ({ name, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

function StatusTable({ rows, total }: { rows: BreakdownRow[]; total: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-gray-700">Issues by Status Category</CardTitle>
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
            {rows.map((row) => {
              const category = row.category ?? "To Do";
              const pct = total ? Math.round((row.count / total) * 100) : 0;
              return (
                <tr key={row.name} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{row.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-block px-2 py-0.5 rounded-full text-white text-xs font-medium"
                      style={{ backgroundColor: pickColor(category, STATUS_CAT_COLOR) }}
                    >
                      {category}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900">{row.count}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

const queryClient = new QueryClient();
const DETAILS_STALE_TIME_MS = 30 * 60 * 1000;

function useDashboardStats(
  selectedBoardId: string,
  selectedProjectKey: string,
  enabled: boolean
) {
  return useQuery<DashboardStats>({
    queryKey: ["dashboardStats", selectedBoardId || null, selectedProjectKey || null],
    queryFn: async () => {
      const res = await getBoardStats(
        selectedBoardId
          ? { boardId: Number(selectedBoardId) }
          : { projectKey: selectedProjectKey }
      );
      return (res.data as { stats?: DashboardStats }).stats ?? EMPTY_STATS;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

function useDashboardStatsDetails(
  selectedBoardId: string,
  selectedProjectKey: string,
  enabled: boolean
) {
  return useQuery<DashboardStats>({
    queryKey: ["dashboardStatsDetails", selectedBoardId || null, selectedProjectKey || null],
    queryFn: async () => {
      const res = await getBoardStatsDetails(
        selectedBoardId
          ? { boardId: Number(selectedBoardId) }
          : { projectKey: selectedProjectKey }
      );
      return (res.data as { stats?: DashboardStats }).stats ?? EMPTY_STATS;
    },
    enabled,
    staleTime: DETAILS_STALE_TIME_MS,
    gcTime: DETAILS_STALE_TIME_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}

function DashboardComponent() {
  const [selectedBoardId, setSelectedBoardId] = useState<string>(
    () => localStorage.getItem("selected_board_id") || ""
  );
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>(
    () => localStorage.getItem("selected_project_key") || ""
  );
  const [boardsCount, setBoardsCount] = useState<number | null>(null);
  const [boardsCountLoading, setBoardsCountLoading] = useState(false);

  useEffect(() => {
    const refreshFilters = () => {
      setSelectedBoardId(localStorage.getItem("selected_board_id") || "");
      setSelectedProjectKey(localStorage.getItem("selected_project_key") || "");
    };
    window.addEventListener("jira-filters-changed", refreshFilters);
    window.addEventListener("storage", refreshFilters);
    return () => {
      window.removeEventListener("jira-filters-changed", refreshFilters);
      window.removeEventListener("storage", refreshFilters);
    };
  }, []);

  useEffect(() => {
    setBoardsCount(null);
    if (!selectedProjectKey || selectedBoardId) {
      setBoardsCountLoading(false);
      return;
    }

    let cancelled = false;
    setBoardsCountLoading(true);
    const check = async () => {
      try {
        const res = await getBoards(selectedProjectKey);
        if (!cancelled) setBoardsCount((res?.data?.boards ?? []).length);
      } catch {
        if (!cancelled) setBoardsCount(0);
      } finally {
        if (!cancelled) setBoardsCountLoading(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectKey, selectedBoardId]);

  const shouldFetchBoard = !!selectedBoardId;
  const shouldFetchProject = !selectedBoardId && !!selectedProjectKey && boardsCount !== null && boardsCount <= 1;
  const shouldFetchStats = shouldFetchBoard || shouldFetchProject;

  const {
    data: dashboardStats = EMPTY_STATS,
    isLoading,
    isFetching,
    error,
  } = useDashboardStats(selectedBoardId, selectedProjectKey, shouldFetchStats);

  const {
    data: dashboardDetails,
    isLoading: detailsLoading,
    isFetching: detailsFetching,
    error: detailsError,
  } = useDashboardStatsDetails(selectedBoardId, selectedProjectKey, shouldFetchStats);

  const detailStats = dashboardDetails ?? dashboardStats;

  const statusChartData = useMemo(
    () => breakdownToRows(detailStats.statusBreakdown),
    [detailStats.statusBreakdown]
  );

  const issueTypeData = useMemo(
    () => countMapToRows(detailStats.issueTypeBreakdown),
    [detailStats.issueTypeBreakdown]
  );

  const priorityData = useMemo(
    () => countMapToRows(detailStats.priorityBreakdown),
    [detailStats.priorityBreakdown]
  );
  const detailedBreakdownsLoading = detailsLoading || detailsFetching;
  const hasDetailedBreakdowns = !!dashboardDetails;

  if (!selectedBoardId && !selectedProjectKey) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Board Overview</h1>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 max-w-md">
          <p className="text-blue-700 font-semibold text-lg mb-2">Select a project or board to get started</p>
          <p className="text-gray-500 text-sm">Use the filters at the top to choose a project or a specific board.</p>
        </div>
      </div>
    );
  }

  if (!selectedBoardId && selectedProjectKey && boardsCount !== null && boardsCount > 1) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Board Overview</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 max-w-md">
          <div className="flex justify-center mb-4">
            <LayoutDashboard size={36} className="text-amber-400" />
          </div>
          <p className="text-amber-800 font-semibold text-lg mb-2">
            {boardsCount} boards found in this project
          </p>
          <p className="text-gray-600 text-sm">
            Select a specific board from the <span className="font-medium">Boards</span> filter above to view its stats.
          </p>
        </div>
      </div>
    );
  }

  if (boardsCountLoading || isLoading || isFetching) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-72 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">Board Overview</h1>
        <div className="bg-red-50 border border-red-300 rounded-xl p-6 text-red-700 mt-4">
          <p>{error instanceof Error ? error.message : "Failed to fetch dashboard stats"}</p>
        </div>
      </div>
    );
  }

  const stats = {
    total: dashboardStats.totalIssues,
    todo: dashboardStats.todoCount,
    inProgress: dashboardStats.inProgressCount,
    done: dashboardStats.doneCount,
  };

  const statCards = [
    {
      title: "Total Issues",
      value: stats.total,
      subtitle: "all statuses",
      icon: <Layers size={22} className="text-gray-500" />,
    },
    {
      title: "To Do",
      value: stats.todo,
      subtitle: `${stats.total ? Math.round((stats.todo / stats.total) * 100) : 0}% of total`,
      icon: <List size={22} className="text-slate-500" />,
    },
    {
      title: "In Progress",
      value: stats.inProgress,
      subtitle: `${stats.total ? Math.round((stats.inProgress / stats.total) * 100) : 0}% of total`,
      icon: <Clock size={22} className="text-blue-500" />,
    },
    {
      title: "Done",
      value: stats.done,
      subtitle: `${stats.total ? Math.round((stats.done / stats.total) * 100) : 0}% of total`,
      icon: <CheckCircle2 size={22} className="text-green-500" />,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Board Overview</h1>
          <p className="text-gray-500 text-sm mt-1">
            {selectedBoardId
              ? `Board ID: ${selectedBoardId}`
              : `Project: ${selectedProjectKey}`}
          </p>
        </div>
        <div className="text-right text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
          <p className="font-medium text-gray-600 text-sm">{stats.total} total issues</p>
          <p>{Math.max(stats.total - stats.done, 0)} open</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-gray-700 text-base">{card.title}</CardTitle>
                {card.icon}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{card.value}</div>
              <p className="text-xs text-gray-500 mt-1">{card.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-gray-700 flex items-center gap-2">
              <BarChart2 size={16} className="text-blue-500" />
              {hasDetailedBreakdowns ? "Cards per Status" : "Cards per Status Category"}
            </CardTitle>
            {detailedBreakdownsLoading && (
              <p className="text-xs text-gray-400 mt-1">Loading detailed status breakdown...</p>
            )}
          </CardHeader>
          <CardContent>
            {statusChartData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No data</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, statusChartData.length * 36)}>
                <BarChart data={statusChartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 16) + "..." : v)}
                  />
                  <Tooltip />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {statusChartData.map((entry, idx) => (
                      <Cell key={idx} fill={pickColor(entry.name, STATUS_CAT_COLOR)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div>
          <StatusTable rows={statusChartData} total={stats.total} />
          {detailedBreakdownsLoading && (
            <p className="text-xs text-gray-400 mt-2 px-1">Detailed status rows are still loading.</p>
          )}
        </div>
      </div>

      {detailedBreakdownsLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-gray-700">By Issue Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse" />
                    <div className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
                    <div className="flex-1 h-2 bg-gray-100 rounded-full animate-pulse" />
                    <div className="h-4 w-8 bg-gray-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-gray-700 flex items-center gap-2">
                <AlertTriangle size={15} className="text-orange-400" />
                By Priority
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse" />
                    <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
                    <div className="flex-1 h-2 bg-gray-100 rounded-full animate-pulse" />
                    <div className="h-4 w-8 bg-gray-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!detailedBreakdownsLoading && detailsError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          Fast summary loaded, but detailed breakdowns failed:{" "}
          {detailsError instanceof Error ? detailsError.message : "Failed to fetch detailed breakdowns"}
        </div>
      )}

      {!detailedBreakdownsLoading && (issueTypeData.length > 0 || priorityData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {issueTypeData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-gray-700">By Issue Type</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {issueTypeData.map(({ name, count }) => (
                    <div key={name} className="flex items-center gap-3">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: pickColor(name) }}
                      />
                      <span className="text-sm text-gray-700 w-32 truncate" title={name}>
                        {name}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${stats.total ? Math.round((count / stats.total) * 100) : 0}%`,
                            backgroundColor: pickColor(name),
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {priorityData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-gray-700 flex items-center gap-2">
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
                        style={{ backgroundColor: pickColor(name, PRIORITY_COLOR) }}
                      />
                      <span className="text-sm text-gray-700 w-28 truncate" title={name}>
                        {name}
                      </span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${stats.total ? Math.round((count / stats.total) * 100) : 0}%`,
                            backgroundColor: pickColor(name, PRIORITY_COLOR),
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardComponent />
    </QueryClientProvider>
  );
}

export default Dashboard;
