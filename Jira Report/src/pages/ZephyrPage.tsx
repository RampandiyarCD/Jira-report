import { useCallback, useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useFilter } from "../context/FilterContext";
import { getZephyrTests } from "../api/jira";
import {
  ArrowLeft,
  TestTube2,
  Calendar,
  User,
  Folder,
  Tag,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Activity,
  Layers,
  Search,
  RotateCw,
} from "lucide-react";
import { TableContainer, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../components/Table";

interface TestExecution {
  id: number;
  key: string;
  testCaseKey: string;
  status: string;
  executedById: string | null;
  executedByName: string;
  executionDate: string | null;
  environment: string | null;
  cycleName: string | null;
  comment: string;
}

interface TestCase {
  key: string;
  name: string;
  status: string;
  priority: string;
  folder: string;
  labels: string[];
  createdOn: string | null;
  updatedOn: string | null;
  executions: TestExecution[];
  lastExecutionStatus: string;
  lastExecutionDate: string | null;
  totalExecutions: number;
  passCount: number;
  failCount: number;
}

// Client-side cache in file scope
const zephyrCache: Record<string, {
  testCases: TestCase[];
  parentSummary: string;
  timestamp: string;
}> = {};

export default function ZephyrPage() {
  const { issueKey } = useParams<{ issueKey: string }>();
  const navigate = useNavigate();
  const { selectedProject } = useFilter();

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [parentSummary, setParentSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchData = useCallback((force = false) => {
    if (!issueKey) return;

    // Check cache first (skip cache when selectedProject changes to avoid stale results)
    if (!force && zephyrCache[issueKey]) {
      const cached = zephyrCache[issueKey];
      setTestCases(cached.testCases);
      setParentSummary(cached.parentSummary);
      setLastUpdated(cached.timestamp);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    getZephyrTests(issueKey, selectedProject)
      .then((res) => {
        if (res.data?.success) {
          const tcs = res.data.testCases || [];
          const summary = res.data.parentSummary || "";
          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

          setTestCases(tcs);
          setParentSummary(summary);
          setLastUpdated(timeStr);

          // Save to cache
          zephyrCache[issueKey] = {
            testCases: tcs,
            parentSummary: summary,
            timestamp: timeStr,
          };
        } else {
          setError(res.data?.message || "Failed to load Zephyr test cases.");
        }
      })
      .catch((err) => {
        setError(err?.response?.data?.message || "Failed to retrieve Zephyr test details. Make sure Zephyr is configured in settings.");
      })
      .finally(() => setLoading(false));
  }, [issueKey, selectedProject]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(false);
  }, [fetchData]);

  const toggleExpand = (caseKey: string) => {
    setExpandedKeys((prev) => ({ ...prev, [caseKey]: !prev[caseKey] }));
  };

  const filteredCases = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return testCases.filter(
      (tc) =>
        tc.key.toLowerCase().includes(q) ||
        tc.name.toLowerCase().includes(q) ||
        tc.folder.toLowerCase().includes(q) ||
        tc.status.toLowerCase().includes(q)
    );
  }, [testCases, searchQuery]);

  const stats = useMemo(() => {
    let totalExecutions = 0;
    let passed = 0;
    let failed = 0;
    testCases.forEach((tc) => {
      totalExecutions += tc.totalExecutions;
      passed += tc.passCount;
      failed += tc.failCount;
    });
    return { total: testCases.length, totalExecutions, passed, failed };
  }, [testCases]);

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (["pass", "passed", "approved"].includes(s)) {
      return (
        <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" /> Pass
        </span>
      );
    }
    if (["fail", "failed", "rejected"].includes(s)) {
      return (
        <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 font-semibold">
          <XCircle className="w-3.5 h-3.5" /> Fail
        </span>
      );
    }
    if (["wip", "in progress", "progress"].includes(s)) {
      return (
        <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 font-semibold">
          <Activity className="w-3.5 h-3.5" /> WIP
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-slate-50 text-slate-600 ring-1 ring-slate-500/10 font-medium">
        <HelpCircle className="w-3.5 h-3.5" /> {status}
      </span>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6 text-center text-slate-400">
        <p className="animate-pulse">Loading Zephyr test details for {issueKey}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-6 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h2 className="text-lg font-bold text-red-800">Zephyr Integration Error</h2>
            <p className="text-sm text-red-600 max-w-md mx-auto">{error}</p>
            <button onClick={() => navigate("/settings")} className="mt-2 px-4 py-2 bg-slate-950 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 transition-colors cursor-pointer">
              Go to Settings
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 mb-2 transition-colors cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Back to Issue
        </button>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TestTube2 className="w-8 h-8 text-violet-600" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">Zephyr Test Cases</h1>
                <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-50 px-2.5 py-1 rounded border border-slate-100">{issueKey}</span>
              </div>
              {parentSummary && <h2 className="text-sm font-semibold text-slate-700 mt-1">{parentSummary}</h2>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-slate-400 font-medium">Last updated: {lastUpdated}</span>
            )}
            <button
              onClick={() => fetchData(true)}
              title="Reload tests"
              className="text-slate-400 hover:text-violet-600 transition-colors p-2 rounded hover:bg-slate-100 cursor-pointer shadow-sm border border-slate-200/50 bg-white"
            >
              <RotateCw className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">Detailed traceability and execution reports for linked test cases.</p>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Test Cases", value: stats.total, color: "text-slate-900" },
          { label: "Total Executions", value: stats.totalExecutions, color: "text-slate-900" },
          { label: "Passed Executions", value: stats.passed, color: "text-emerald-700" },
          { label: "Failed Executions", value: stats.failed, color: "text-rose-700" },
        ].map((item, idx) => (
          <Card key={idx}>
            <CardContent className="p-6">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{item.label}</div>
              <div className={`text-2xl font-bold ${item.color} mt-1`}>{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Test Cases List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base font-bold text-slate-800">Linked Test Cases</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <label htmlFor="zephyr-search" className="sr-only">Search test cases</label>
            <input
              id="zephyr-search"
              name="zephyr-search"
              type="text"
              placeholder="Search test cases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredCases.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">No test cases found matching your search.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredCases.map((tc) => {
                const isExpanded = !!expandedKeys[tc.key];
                return (
                  <div key={tc.key} className="p-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded border border-violet-100">{tc.key}</span>
                          <h3 className="text-sm font-semibold text-slate-800">{tc.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          {tc.folder && (
                            <span className="flex items-center gap-1">
                              <Folder className="w-3.5 h-3.5 text-slate-400" /> {tc.folder}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Tag className="w-3.5 h-3.5 text-slate-400" /> Priority: <span className="font-semibold text-slate-600">{tc.priority}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Activity className="w-3.5 h-3.5 text-slate-400" /> Status: <span className="font-semibold text-slate-600">{tc.status}</span>
                          </span>
                        </div>
                        {tc.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {tc.labels.map((lbl) => (
                              <span key={lbl} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{lbl}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-xs text-slate-400">Last Run Status</div>
                          <div className="mt-1 flex justify-end">{getStatusBadge(tc.lastExecutionStatus)}</div>
                        </div>
                        <button onClick={() => toggleExpand(tc.key)} className="p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer text-slate-400 hover:text-slate-600">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 bg-slate-50/50 rounded-lg p-3">
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-500 mb-2 px-3">
                          <span className="flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-slate-400" /> Execution History ({tc.executions.length})
                          </span>
                        </div>
                        {tc.executions.length === 0 ? (
                          <div className="text-xs text-slate-400 italic py-2 px-3">No executions recorded for this test case.</div>
                        ) : (
                          <TableContainer className="border-slate-200/60 shadow-none bg-transparent">
                            <Table className="text-xs">
                              <TableHeader className="bg-transparent border-b border-slate-200/60 text-slate-400">
                                <TableRow className="hover:bg-transparent">
                                  <TableHead className="pb-2 px-3 font-semibold text-slate-400 normal-case select-none">Execution Key</TableHead>
                                  <TableHead className="pb-2 px-3 font-semibold text-slate-400 normal-case select-none">Status</TableHead>
                                  <TableHead className="pb-2 px-3 font-semibold text-slate-400 normal-case select-none">Environment</TableHead>
                                  <TableHead className="pb-2 px-3 font-semibold text-slate-400 normal-case select-none">Test Cycle</TableHead>
                                  <TableHead className="pb-2 px-3 font-semibold text-slate-400 normal-case select-none">Executed By</TableHead>
                                  <TableHead className="pb-2 px-3 font-semibold text-slate-400 normal-case select-none">Executed On</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody className="bg-transparent">
                                {tc.executions.map((exec) => (
                                  <TableRow key={exec.id} className="hover:bg-slate-100/50">
                                    <TableCell className="py-2.5 px-3 font-mono font-semibold text-slate-600">{exec.key}</TableCell>
                                    <TableCell className="py-2.5 px-3">{getStatusBadge(exec.status)}</TableCell>
                                    <TableCell className="py-2.5 px-3 text-slate-500">{exec.environment || "—"}</TableCell>
                                    <TableCell className="py-2.5 px-3 text-slate-500 font-medium">{exec.cycleName || "—"}</TableCell>
                                    <TableCell className="py-2.5 px-3 text-slate-500">
                                      <span className="flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span>{exec.executedByName}</span>
                                      </span>
                                    </TableCell>
                                    <TableCell className="py-2.5 px-3 text-slate-500">
                                      <span className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span>{formatDate(exec.executionDate)}</span>
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
