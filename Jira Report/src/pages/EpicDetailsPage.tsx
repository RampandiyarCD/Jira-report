import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getEpicDetailsPage, checkZephyrIssues } from "../api/jira";
import { 
  ArrowLeft, 
  CheckCircle2, 
  TrendingUp, 
  Package, 
  Timer, 
  Activity, 
  X, 
  RotateCw, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  TestTube2 
} from "lucide-react";
import { Select } from "../components/Select";
import { useFilter } from "../context/FilterContext";
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/Table";

// Helper styles
function statusBadgeClass(statusCat: string) {
  const sc = statusCat.toLowerCase();
  if (sc === "done") return "bg-green-50 text-green-700 ring-green-600/20";
  if (sc === "in progress") return "bg-blue-50 text-blue-700 ring-blue-600/20";
  return "bg-slate-50 text-slate-600 ring-slate-500/10";
}

function priorityColor(p: string) {
  const lp = p?.toLowerCase();
  if (lp === "highest" || lp === "critical") return "text-red-600 font-semibold";
  if (lp === "high") return "text-orange-500 font-semibold";
  if (lp === "medium") return "text-yellow-600 font-semibold";
  return "text-slate-400 font-medium";
}

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateWithTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " + 
         d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function getDaysOpen(createdStr: string, resolutionStr: string | null): number {
  const start = new Date(createdStr);
  const end = resolutionStr ? new Date(resolutionStr) : new Date();
  const diff = Math.max(0, end.getTime() - start.getTime());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// Interfaces
interface Epic {
  key: string;
  name: string;
  summary: string;
  status: string;
  progress: number;
  creator: string;
  creatorAvatar: string;
}

interface EpicIssue {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
  priority: string;
  issueType: string;
  assignee: { displayName: string; avatarUrl: string } | null;
  reporter: { displayName: string } | null;
  storyPoints: number | null;
  created: string;
  resolutionDate: string | null;
  updated: string;
  labels: string[];
  components: string[];
  changelog: Array<{
    author: string;
    field: string;
    from: string | null;
    to: string | null;
    created: string;
  }>;
}

// Client-side cache in file scope
interface EpicCacheData {
  epic: Epic;
  issues: EpicIssue[];
  issuesWithTests: Set<string>;
  timestamp: string;
}

const epicCache: Record<string, EpicCacheData> = {};

export function EpicDetailsPage() {
  const { epicKey } = useParams<{ epicKey: string }>();
  const navigate = useNavigate();

  const [epic, setEpic] = useState<Epic | null>(null);
  const [issues, setIssues] = useState<EpicIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<EpicIssue | null>(null);
  const [issuesWithTests, setIssuesWithTests] = useState<Set<string>>(new Set());
  const { selectedProject } = useFilter();
  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");

  // Sorting
  const [sortKey, setSortKey] = useState<keyof EpicIssue>("key");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const fetchData = (forceRefresh = false) => {
    if (!epicKey) return;

    // Check cache first
    if (!forceRefresh && epicCache[epicKey]) {
      const cached = epicCache[epicKey];
      setEpic(cached.epic);
      setIssues(cached.issues);
      setIssuesWithTests(cached.issuesWithTests);
      setLastUpdated(cached.timestamp);
      setLoading(false);
      return;
    }

    setLoading(true);
    getEpicDetailsPage(epicKey, forceRefresh)
      .then((res) => {
        if (res.data) {
          const ep = res.data.epic;
          const iss = res.data.issues || [];
          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          setEpic(ep);
          setIssues(iss);
          setLastUpdated(timeStr);

          // Check Zephyr tests for issues
          const keys = iss.map((i: any) => i.key);
          if (keys.length > 0) {
            checkZephyrIssues(keys, selectedProject)
              .then((zRes) => {
                const zTests = new Set<string>(zRes.data?.issuesWithTests || []);
                setIssuesWithTests(zTests);
                epicCache[epicKey] = {
                  epic: ep,
                  issues: iss,
                  issuesWithTests: zTests,
                  timestamp: timeStr,
                };
              })
              .catch(() => {
                const zTests = new Set<string>();
                setIssuesWithTests(zTests);
                epicCache[epicKey] = {
                  epic: ep,
                  issues: iss,
                  issuesWithTests: zTests,
                  timestamp: timeStr,
                };
              });
          } else {
            const zTests = new Set<string>();
            setIssuesWithTests(zTests);
            epicCache[epicKey] = {
              epic: ep,
              issues: iss,
              issuesWithTests: zTests,
              timestamp: timeStr,
            };
          }
        }
      })
      .catch((err) => {
        console.error(err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData(false); // don't force refresh, read from cache by default
  }, [epicKey]);

  // Unique lists for filters
  const uniqueTypes = useMemo(() => Array.from(new Set(issues.map((i) => i.issueType))).filter(Boolean).sort(), [issues]);
  const uniqueStatuses = useMemo(() => Array.from(new Set(issues.map((i) => i.status))).filter(Boolean).sort(), [issues]);
  const uniquePriorities = useMemo(() => Array.from(new Set(issues.map((i) => i.priority))).filter(Boolean).sort(), [issues]);
  const uniqueAssignees = useMemo(() => Array.from(new Set(issues.map((i) => i.assignee?.displayName ?? "Unassigned"))).filter(Boolean).sort(), [issues]);

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || [i.key, i.summary].some((v) => v.toLowerCase().includes(q));
      const matchesType = typeFilter === "all" || i.issueType === typeFilter;
      const matchesStatus = statusFilter === "all" || i.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || i.priority === priorityFilter;
      const matchesAssignee = assigneeFilter === "all" || (i.assignee?.displayName ?? "Unassigned") === assigneeFilter;

      return matchesSearch && matchesType && matchesStatus && matchesPriority && matchesAssignee;
    });
  }, [issues, searchQuery, typeFilter, statusFilter, priorityFilter, assigneeFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      // Handle nested or complex objects if needed
      if (sortKey === "assignee") {
        valA = a.assignee?.displayName ?? "Unassigned";
        valB = b.assignee?.displayName ?? "Unassigned";
      }

      const comp = String(valA ?? "").localeCompare(String(valB ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return sortDirection === "asc" ? comp : -comp;
    });
  }, [filtered, sortKey, sortDirection]);

  const handleSort = (key: keyof EpicIssue) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const resetFilters = () => {
    setSearchQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setPriorityFilter("all");
    setAssigneeFilter("all");
  };

  // Metrics
  const metrics = useMemo(() => {
    const totalIssues = issues.length;
    const completed = issues.filter((i) => i.statusCategory.toLowerCase() === "done").length;
    const inProgress = issues.filter((i) => i.statusCategory.toLowerCase() === "in progress").length;
    const toDo = totalIssues - completed - inProgress;

    const totalPts = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const completedPts = issues.filter((i) => i.statusCategory.toLowerCase() === "done").reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const remainingPts = totalPts - completedPts;

    return { totalIssues, completed, inProgress, toDo, totalPts, completedPts, remainingPts };
  }, [issues]);

  if (loading) {
    return (
      <div className="p-6 space-y-6 text-center text-slate-400">
        <p className="animate-pulse">Loading Epic details page...</p>
      </div>
    );
  }

  if (!epic) {
    return (
      <div className="p-6">
        <button onClick={() => navigate("/epics")} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Epics
        </button>
        <div className="text-center py-12 text-slate-400">
          Epic not found.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button onClick={() => navigate("/epics")} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-2 transition-colors cursor-pointer">
            <ArrowLeft className="h-4 w-4" /> Back to Epics
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{epic.name}</h1>
            <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded border border-slate-100">{epic.key}</span>
            {epic.progress === 100 && (
              <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200/50 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> Done
              </span>
            )}
          </div>
          {epic.summary && epic.summary !== epic.name && (
            <p className="text-xs text-slate-500 mt-1">{epic.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
            {epic.creatorAvatar ? (
              <img src={epic.creatorAvatar} alt={epic.creator} className="w-8 h-8 rounded-full border border-slate-200" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 border border-slate-200">
                {epic.creator.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-xs text-slate-400">Creator</div>
              <div className="text-xs font-semibold text-slate-700">{epic.creator}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lastUpdated && (
              <span className="text-xs text-slate-400 font-medium">Last updated: {lastUpdated}</span>
            )}
            <button
              onClick={() => fetchData(true)}
              title="Refresh from Jira"
              className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded hover:bg-slate-100 cursor-pointer shadow-sm border border-slate-200/50 bg-white"
            >
              <RotateCw className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Progress Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{epic.progress}%</div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${epic.progress === 100 ? "bg-green-500" : "bg-blue-500"}`}
                style={{ width: `${epic.progress}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Total Issues Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Issues Count</span>
              <Package className="w-4 h-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{metrics.totalIssues}</div>
            <div className="text-xs text-slate-500 mt-1">
              {metrics.completed} Done · {metrics.inProgress} In Progress · {metrics.toDo} To Do
            </div>
          </CardContent>
        </Card>

        {/* Story Points Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Story Points</span>
              <Activity className="w-4 h-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{metrics.totalPts} pts</div>
            <div className="text-xs text-slate-500 mt-1">
              {metrics.completedPts} Completed · {metrics.remainingPts} Remaining
            </div>
          </CardContent>
        </Card>

        {/* Active Ratio Card */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status category</span>
              <Timer className="w-4 h-4 text-orange-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{epic.status}</div>
            <div className="text-xs text-slate-500 mt-1">
              Epic status category on Jira
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Issues Table Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Issues List</CardTitle>
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
            Showing {filtered.length} of {issues.length}
          </span>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col lg:flex-row lg:items-end gap-3 pb-4 border-b border-slate-100">
              <div className="flex-1 relative">
                <label htmlFor="issue-search" className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">Search Issues</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    id="issue-search"
                    name="issue-search"
                    type="text"
                    className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-9 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 shadow-sm"
                    placeholder="Search by key, summary..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="w-full lg:w-40">
                <Select name="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="all">All Types</option>
                  {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </div>

              <div className="w-full lg:w-40">
                <Select name="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All Statuses</option>
                  {uniqueStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>

              <div className="w-full lg:w-40">
                <Select name="Priority" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                  <option value="all">All Priorities</option>
                  {uniquePriorities.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>

              <div className="w-full lg:w-40">
                <Select name="Assignee" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
                  <option value="all">All Assignees</option>
                  {uniqueAssignees.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </div>

              {(searchQuery || typeFilter !== "all" || statusFilter !== "all" || priorityFilter !== "all" || assigneeFilter !== "all") && (
                <button onClick={resetFilters} className="flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-sm shrink-0">
                  <X className="w-4 h-4" /> Reset
                </button>
              )}
            </div>

            {sorted.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                No issues match your filter criteria.
              </div>
            ) : (
              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableRow>
                      {[
                        { label: "Key", key: "key" as keyof EpicIssue },
                        { label: "Type", key: "issueType" as keyof EpicIssue },
                        { label: "Summary", key: "summary" as keyof EpicIssue },
                        { label: "Status", key: "status" as keyof EpicIssue },
                        { label: "Priority", key: "priority" as keyof EpicIssue },
                        { label: "Assignee", key: "assignee" as keyof EpicIssue },
                        { label: "Points", key: "storyPoints" as keyof EpicIssue },
                        { label: "Days Open", key: "created" as keyof EpicIssue },
                      ].map((col) => (
                        <TableHead key={col.key} className="cursor-pointer hover:bg-slate-100 hover:text-slate-700 transition-colors" onClick={() => handleSort(col.key)}>
                          <div className="flex items-center gap-1.5 select-none">
                            {col.label}
                            {sortKey === col.key ? (
                              sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                            ) : (
                              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-50" />
                            )}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((issue) => (
                      <TableRow 
                        key={issue.key} 
                        className="cursor-pointer"
                        onClick={() => setSelectedIssue(issue)}
                      >
                        <TableCell className="whitespace-nowrap">
                          <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 group-hover:bg-white group-hover:border-slate-200 transition-colors">{issue.key}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-medium text-slate-500">
                          {issue.issueType}
                        </TableCell>
                        <TableCell className="max-w-xs md:max-w-md">
                          <div className="text-sm font-medium text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">{issue.summary}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium inline-block ring-1 ${statusBadgeClass(issue.statusCategory)}`}>
                              {issue.status}
                            </span>
                            {issuesWithTests.has(issue.key) && (
                              <button
                                onClick={(e) => { e.stopPropagation(); navigate(`/zephyr/${issue.key}`); }}
                                title="View Zephyr tests"
                                className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100 transition-colors cursor-pointer"
                              >
                                <TestTube2 className="w-3 h-3" />
                                Tests
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <span className={priorityColor(issue.priority)}>{issue.priority}</span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {issue.assignee ? (
                            <div className="flex items-center gap-1.5">
                              {issue.assignee.avatarUrl ? (
                                <img src={issue.assignee.avatarUrl} alt={issue.assignee.displayName} className="w-5 h-5 rounded-full border border-slate-100" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500 border border-slate-200">
                                  {issue.assignee.displayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="text-xs font-medium text-slate-700">{issue.assignee.displayName}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-mono font-medium text-slate-700">
                          {issue.storyPoints !== null ? issue.storyPoints : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-medium text-slate-500">
                          {getDaysOpen(issue.created, issue.resolutionDate)}d
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Slide-out Issue Detail Drawer */}
      <IssueDrawer 
        issue={selectedIssue} 
        onClose={() => setSelectedIssue(null)} 
        hasTests={selectedIssue ? issuesWithTests.has(selectedIssue.key) : false}
      />
    </div>
  );
}

// ─── Slide-out Issue Details Drawer ───────────────────────────────────────────
function IssueDrawer({ 
  issue, 
  onClose,
  hasTests
}: { 
  issue: EpicIssue | null; 
  onClose: () => void; 
  hasTests: boolean;
}) {
  const navigate = useNavigate();

  // Prevent background scroll when open
  useEffect(() => {
    if (!issue) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [issue]);

  // Handle escape key
  useEffect(() => {
    if (!issue) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [issue, onClose]);

  if (!issue) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      {/* Drawer Container */}
      <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden border-l border-slate-100 transition-transform duration-300 transform translate-x-0">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200/60 bg-slate-50/50 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-mono font-bold text-blue-600">{issue.key}</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ring-1 ${statusBadgeClass(issue.statusCategory)}`}>
                {issue.status}
              </span>
              <span className={`text-xs ${priorityColor(issue.priority)}`}>
                {issue.priority}
              </span>
            </div>
            <h2 className="text-sm font-semibold text-slate-800 mt-2 leading-snug">{issue.summary}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 cursor-pointer transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Attributes Grid */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Properties</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100">
                <div className="text-xs text-slate-400">Type</div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">{issue.issueType}</div>
              </div>
              <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100">
                <div className="text-xs text-slate-400">Assignee</div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">{issue.assignee?.displayName ?? "Unassigned"}</div>
              </div>
              <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100">
                <div className="text-xs text-slate-400">Story Points</div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">{issue.storyPoints !== null ? issue.storyPoints : "—"}</div>
              </div>
              <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100">
                <div className="text-xs text-slate-400">Days Open</div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">{getDaysOpen(issue.created, issue.resolutionDate)} days</div>
              </div>
              <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100">
                <div className="text-xs text-slate-400">Created</div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">{formatDate(issue.created)}</div>
              </div>
              <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100">
                <div className="text-xs text-slate-400">Reporter</div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">{issue.reporter?.displayName ?? "—"}</div>
              </div>
            </div>
          </div>

          {/* Labels & Components */}
          {issue.labels.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Labels</h3>
              <div className="flex flex-wrap gap-1.5">
                {issue.labels.map((l) => (
                  <span key={l} className="text-xs px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium border border-blue-100/50">{l}</span>
                ))}
              </div>
            </div>
          )}

          {issue.components.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Components</h3>
              <div className="flex flex-wrap gap-1.5">
                {issue.components.map((c) => (
                  <span key={c} className="text-xs px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full font-medium border border-purple-100/50">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* History Timeline */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Activity History</h3>
            {issue.changelog.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No activity recorded for status or assignee updates.</p>
            ) : (
              <div className="relative border-l-2 border-slate-100 pl-4 space-y-4">
                {issue.changelog.map((c, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-blue-500 ring-4 ring-white" />
                    <div className="text-xs font-semibold text-slate-500">{formatDateWithTime(c.created)}</div>
                    <div className="text-xs text-slate-700 mt-1">
                      <span className="font-semibold text-slate-800">{c.author}</span> changed <span className="font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-100 text-slate-600">{c.field}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="line-through">{c.from || "None"}</span>
                      <span>→</span>
                      <span className="font-semibold text-slate-700">{c.to || "None"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Zephyr Test Cases Link */}
          {hasTests && (
            <div className="pt-4 border-t border-slate-100">
              <button
                onClick={() => {
                  navigate(`/zephyr/${issue.key}`);
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <TestTube2 className="w-4 h-4" />
                View Zephyr Test Cases & Executions
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
