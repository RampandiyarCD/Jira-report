import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useEffect, useState } from "react";
import { getEpics, getEpicsAll } from "../api/jira";
import toast from "react-hot-toast";

interface Epic {
  key: string;
  name: string;
  summary: string;
  status: string;
  done: boolean;
}

export function EpicsPage() {
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(false);

  const [boardId, setBoardId] = useState<string>(() => localStorage.getItem("selected_board_id") || "");
  const [projectKey, setProjectKey] = useState<string>(() => localStorage.getItem("selected_project_key") || "");

  useEffect(() => {
    const refreshFilters = () => {
      setBoardId(localStorage.getItem("selected_board_id") || "");
      setProjectKey(localStorage.getItem("selected_project_key") || "");
    };
    window.addEventListener("jira-filters-changed", refreshFilters);
    return () => window.removeEventListener("jira-filters-changed", refreshFilters);
  }, []);

  useEffect(() => {
    const fetchEpics = async () => {
      setLoading(true);
      try {
        if (boardId) {
          // Single board — use the existing board-scoped epic endpoint.
          const result = await getEpics(Number(boardId));
          setEpics(result?.data?.epics ?? []);
        } else {
          // All projects or project-specific — single JQL query, no per-board calls.
          const result = await getEpicsAll(projectKey || undefined);
          setEpics(result?.data?.epics ?? []);
        }
      } catch (error) {
        console.error("Failed to fetch epics:", error);
        toast.error("Failed to fetch epics");
        setEpics([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEpics();
  }, [boardId, projectKey]);

  const completedCount = epics.filter((e) => e.done).length;
  const inProgressCount = epics.filter((e) => !e.done).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Epic Intelligence</h1>
        <p className="text-gray-500 text-sm">
          {boardId
            ? "Epics for the selected board"
            : projectKey
              ? "Cumulative epics across all boards in the selected project"
              : "Cumulative epics across all projects and boards"}
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-gray-800">{epics.length}</div>
            <div className="text-xs text-gray-500">Total Epics</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            <div className="text-xs text-gray-500">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{inProgressCount}</div>
            <div className="text-xs text-gray-500">In Progress</div>
          </CardContent>
        </Card>
      </div>

      {/* Epic List */}
      <Card>
        <CardHeader>
          <CardTitle>All Epics</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="text-gray-400 text-sm text-center py-8">Loading epics...</p>
          )}
          {!loading && epics.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">No epics found</p>
          )}
          {!loading && epics.length > 0 && (
            <div className="divide-y divide-gray-100">
              {epics.map((epic) => (
                <div key={epic.key} className="flex items-center justify-between py-3 px-2">
                  <div>
                    <span className="text-xs font-mono text-gray-400 mr-2">{epic.key}</span>
                    <span className="text-sm font-medium text-gray-800">{epic.name}</span>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      epic.done
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {epic.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
