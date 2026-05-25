import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { useEffect, useState } from "react";
import { getEpics } from "../api/jira";
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

  const boardId = localStorage.getItem("selected_board_id");

  

  useEffect(() => {
    const fetchEpics = async () => {
      if (!boardId) {
        toast.error("Please select a board");
        setEpics([]);
        return;
      }
      setLoading(true);
      try {
        const result = await getEpics(Number(boardId));
        if (result?.data?.epics) {
          setEpics(result.data.epics);
        }
        console.log(result.data.epics);
      } catch (error) {
        console.error("Failed to fetch epics:", error);
        setEpics([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEpics();
  }, [boardId]);

  const completedCount = epics.filter((e) => e.done).length;
  const inProgressCount = epics.filter((e) => !e.done).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Epic Intelligence</h1>
        <p className="text-gray-500 text-sm">Portfolio health, risk scoring, and delivery prediction</p>
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
          {!boardId && (
            <p className="text-gray-400 text-sm text-center py-8">Select a board to view epics</p>
          )}
          {boardId && loading && (
            <p className="text-gray-400 text-sm text-center py-8">Loading epics...</p>
          )}
          {boardId && !loading && epics.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">No epics found for this board</p>
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
