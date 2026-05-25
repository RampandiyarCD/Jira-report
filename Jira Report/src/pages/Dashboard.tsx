import { useEffect, useState } from "react";
import axios from "axios";
import { BarChart2, List, Clock, CheckCircle2 } from "lucide-react";
import { getBoardStats } from "../api/jira";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";

interface BoardStats {
  totalIssues: number;
  todoCount: number;
  inProgressCount: number;
  doneCount: number;
  boardCount?: number;
  failedBoardCount?: number;
}

export const Dashboard = () => {
  const [selectedBoardId, setSelectedBoardId] = useState<string>(() => localStorage.getItem("selected_board_id") || "");
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>(() => localStorage.getItem("selected_project_key") || "");
  const [stats, setStats] = useState<BoardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (!selectedBoardId && !selectedProjectKey) {
      return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        const statsRes = await getBoardStats(
          selectedBoardId
            ? { boardId: Number(selectedBoardId) }
            : { projectKey: selectedProjectKey }
        );

        if (statsRes.data.success) {
          setStats(statsRes.data.stats);
        }

        setError(null);
      } catch (err: unknown) {
        console.error("Error fetching data:", err);
        if (axios.isAxiosError(err)) {
          const apiMessage = err.response?.data?.message;
          setError(apiMessage || err.message || "Failed to fetch board data");
        } else if (err instanceof Error) {
          setError(err.message || "Failed to fetch board data");
        } else {
          setError("Failed to fetch board data");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedBoardId, selectedProjectKey]);

  if (!selectedBoardId && !selectedProjectKey) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Board Overview</h1>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 max-w-md">
          <p className="text-blue-700 font-semibold text-lg mb-2">Select a project or board to get started</p>
          <p className="text-gray-500 text-sm">Use the filters at the top to choose a project or a specific board, then your stats will appear here.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">Board Overview</h1>
        <p className="text-gray-500 text-sm mt-2">Loading...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900">Board Overview</h1>
        <div className="bg-red-50 border border-red-300 rounded-xl p-6 text-red-700 mt-4">
          <p>{error || "Failed to load board data"}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Issues",
      value: stats.totalIssues,
      color: "from-blue-600 to-blue-400",
      icon: <BarChart2 size={22} className="text-blue-500" />,
    },
    {
      title: "To Do",
      value: stats.todoCount,
      color: "from-gray-600 to-gray-400",
      icon: <List size={22} className="text-gray-500" />,
    },
    {
      title: "In Progress",
      value: stats.inProgressCount,
      color: "from-yellow-600 to-yellow-400",
      icon: <Clock size={22} className="text-yellow-500" />,
    },
    {
      title: "Done",
      value: stats.doneCount,
      color: "from-green-600 to-green-400",
      icon: <CheckCircle2 size={22} className="text-green-500" />,
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Board Overview</h1>
        <p className="text-gray-500 text-sm">
          {selectedBoardId
            ? "Track selected board progress and epics"
            : selectedProjectKey
              ? "Cumulative issue counts across all boards in the selected project"
              : "Cumulative issue counts across all projects and boards"}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card
            key={card.title}
            className="bg-gradient-to-br border-0"
            style={{
              backgroundImage: `linear-gradient(to bottom right, hsl(var(--card)), hsl(var(--card)))`,
            }}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-gray-700">{card.title}</CardTitle>
                {card.icon}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">{card.value}</div>
              <p className="text-xs text-gray-500 mt-2">
                {card.title === "Done"
                  ? `${Math.round((card.value / Math.max(stats.totalIssues, 1)) * 100)}% Complete`
                  : "issues"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!selectedBoardId && stats.boardCount != null && (
        <p className="text-gray-500 text-sm">Aggregated across {stats.boardCount} board(s).</p>
      )}

      {!selectedBoardId && (stats.failedBoardCount ?? 0) > 0 && (
        <p className="text-amber-300 text-sm">
          Partial data: {stats.failedBoardCount} board(s) were skipped due to rate limits or access restrictions.
        </p>
      )}
    </div>
  );
};

