import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useEffect, useState } from "react";
import { getEpics } from "../api/jira";
import { useFilter } from "../context/FilterContext";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, Clock, X, RotateCw, Layers } from "lucide-react";
import { Select } from "../components/Select";
import { useNavigate } from "react-router-dom";
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/Table";

interface Epic {
  key: string;
  name: string;
  summary: string;
  status: string;
  progress: number;
  creator: string;
  creatorAvatar: string;
}

const STATUS_FILTER_VALUES = ["all", "completed", "inprogress"] as const;
type StatusFilter = (typeof STATUS_FILTER_VALUES)[number];

// Module-level cache — same pattern as Dashboard's dashboardCache
const epicCache: Record<string, { epics: Epic[]; timestamp: string }> = {};

export function EpicsPage() {
  const navigate = useNavigate();
  const { selectedBoard: boardId, dateFrom, dateTo } = useFilter();
  const cacheKey = `${boardId}|${dateFrom}|${dateTo}`;

  // Single state object tied to its boardId — exact same pattern as Dashboard.
  // loading and epics are derived, so they always match the current boardId:
  // switching boards immediately shows a spinner, never stale data.
  const [boardData, setBoardData] = useState<{ boardId: string; epics: Epic[]; timestamp: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loading = !!boardId && boardData?.boardId !== cacheKey;
  const epics = boardData?.boardId === cacheKey ? boardData.epics : [];
  const lastUpdated = boardData?.boardId === cacheKey ? boardData.timestamp : "";

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [jiraStatusFilter, setJiraStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<keyof Epic>("key");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!boardId) return;

    let cancelled = false;

    // Use cached entry if available (via Promise.resolve so setState is always async),
    // otherwise fire a real request — identical to how Dashboard handles its cache.
    const dataPromise = epicCache[cacheKey]
      ? Promise.resolve(epicCache[cacheKey])
      : getEpics(Number(boardId), dateFrom || undefined, dateTo || undefined).then((res) => {
          const data: Epic[] = res?.data?.epics || [];
          const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          const entry = { epics: data, timestamp };
          epicCache[cacheKey] = entry;
          return entry;
        });

    dataPromise
      .then((entry) => {
        if (!cancelled) setBoardData({ boardId: cacheKey, ...entry });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setBoardData({ boardId: cacheKey, epics: [], timestamp: "" });
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, boardId, refreshKey]);

  const handleRefresh = () => {
    if (!boardId) return;
    delete epicCache[cacheKey];
    setBoardData(null);
    setRefreshKey((k) => k + 1);
  };

  const uniqueStatuses = Array.from(new Set(epics.map((e) => e.status))).filter(Boolean);

  const filtered = epics.filter((e) => {
    const q = searchQuery.toLowerCase();
    return (
      (!q || [e.key, e.name, e.summary].some((v) => (v || "").toLowerCase().includes(q))) &&
      (statusFilter === "all" || (statusFilter === "completed" ? e.progress === 100 : e.progress < 100)) &&
      (jiraStatusFilter === "all" || e.status === jiraStatusFilter)
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const comp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true, sensitivity: "base" });
    return sortDirection === "asc" ? comp : -comp;
  });

  const handleSort = (key: keyof Epic) => {
    if (sortKey === key) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const hasFilters = searchQuery || statusFilter !== "all" || jiraStatusFilter !== "all";
  const resetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setJiraStatusFilter("all");
  };

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if ((STATUS_FILTER_VALUES as readonly string[]).includes(val)) {
      setStatusFilter(val as StatusFilter);
    }
  };


  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Epic Details</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Epics", val: epics.length, col: "text-gray-800", icon: Layers },
          { label: "Completed", val: epics.filter((e) => e.progress === 100).length, col: "text-green-600", icon: CheckCircle2 },
          { label: "In Progress", val: epics.filter((e) => e.progress < 100).length, col: "text-blue-600", icon: Clock },
        ].map((c, i) => {
          const Icon = c.icon;
          return (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between space-y-0 pb-1">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{c.label}</span>
                  <Icon className="w-4 h-4 text-slate-400" />
                </div>
                <div className={`text-2xl font-bold ${c.col}`}>{c.val}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <CardTitle>All Epics</CardTitle>
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-xs text-slate-400 font-medium">Last updated: {lastUpdated}</span>
              )}
              {boardId && (
                <button
                  onClick={handleRefresh}
                  title="Refresh from Jira"
                  className="text-slate-400 hover:text-blue-600 transition-colors p-1 rounded hover:bg-slate-100 cursor-pointer animate-none"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              )}
            </div>
          </div>
          {!loading && boardId && epics.length > 0 && (
            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
              Showing {filtered.length} of {epics.length}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {!boardId ? (
            <p className="text-gray-400 text-sm text-center py-8">Select a board to view epics</p>
          ) : loading ? (
            <p className="text-gray-400 text-sm text-center py-8">Loading epics...</p>
          ) : epics.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">No epics found for this board</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-end gap-4 pb-4 border-b border-slate-100">
                <div className="flex-1 relative">
                  <label htmlFor="epic-search" className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Search Epics</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      id="epic-search"
                      type="text"
                      className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-9 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 shadow-sm"
                      placeholder="Search by key, name, or summary..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        aria-label="Clear search"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="w-full md:w-48">
                  <Select name="Completion" value={statusFilter} onChange={handleStatusFilterChange}>
                    <option value="all">All Completion</option>
                    <option value="completed">Completed</option>
                    <option value="inprogress">In Progress</option>
                  </Select>
                </div>
                <div className="w-full md:w-48">
                  <Select name="Jira Status" value={jiraStatusFilter} onChange={(e) => setJiraStatusFilter(e.target.value)}>
                    <option value="all">All Statuses</option>
                    {uniqueStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </div>
                {hasFilters && (
                  <button onClick={resetFilters} className="flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-sm shrink-0">
                    <X className="w-4 h-4" /> Reset
                  </button>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-sm">No epics match your search and filter criteria.</p>
                  <button onClick={resetFilters} className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-500 underline cursor-pointer">Reset all filters</button>
                </div>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {[
                          { label: "Key", key: "key" as keyof Epic },
                          { label: "Epic Name", key: "name" as keyof Epic },
                          { label: "Creator", key: "creator" as keyof Epic },
                          { label: "Progress", key: "progress" as keyof Epic },
                          { label: "Jira Status", key: "status" as keyof Epic },
                        ].map((col) => (
                          <TableHead
                            key={col.key}
                            aria-sort={sortKey === col.key ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
                            className="hover:bg-slate-100 transition-colors"
                          >
                            <button
                              onClick={() => handleSort(col.key)}
                              className="flex items-center gap-1.5 select-none w-full cursor-pointer hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset rounded"
                            >
                              {col.label}
                              {sortKey === col.key ? (
                                sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                              ) : (
                                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-50" />
                              )}
                            </button>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map((epic) => (
                        <TableRow 
                          key={epic.key} 
                          className="cursor-pointer"
                          onClick={() => navigate(`/epics/${epic.key}`)}
                        >
                          <TableCell className="whitespace-nowrap py-4">
                            <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 group-hover:bg-white group-hover:border-slate-200 transition-colors">{epic.key}</span>
                          </TableCell>
                          <TableCell className="py-4 max-w-xs md:max-w-md">
                            <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{epic.name}</div>
                            {epic.summary && epic.summary !== epic.name && <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{epic.summary}</div>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-4">
                            <div className="flex items-center gap-2">
                              {epic.creatorAvatar ? (
                                <img 
                                  src={epic.creatorAvatar} 
                                  alt={epic.creator} 
                                  className="w-6 h-6 rounded-full border border-slate-200"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-200">
                                  {epic.creator.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-sm text-slate-600 font-medium">{epic.creator}</span>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-4">
                            <div className="flex items-center gap-3 w-40">
                              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/50">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                                    epic.progress === 100 ? "bg-green-500" : "bg-blue-500"
                                  }`}
                                  style={{ width: `${epic.progress}%` }}
                                />
                              </div>
                              <span className={`text-xs font-semibold ${
                                epic.progress === 100 ? "text-green-600" : "text-slate-600"
                              }`}>
                                {epic.progress}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap py-4">
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium inline-block ring-1 ${epic.progress === 100 ? "bg-green-50 text-green-700 ring-green-600/20" :
                                epic.status.toLowerCase().includes("progress") || epic.status.toLowerCase().includes("dev") ? "bg-blue-50 text-blue-700 ring-blue-600/20" :
                                  "bg-slate-50 text-slate-600 ring-slate-500/10"
                              }`}>{epic.status}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
