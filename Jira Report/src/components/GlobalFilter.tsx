import { Select } from './Select'
import { Label } from './Label'
import { getBoards, getProjects } from '../api/jira'
import { useEffect, useRef, useState } from 'react';


export function GlobalFilters() {
  const [projects, setProjects] = useState<{ name: string; key: string }[]>([]);
  const [boards, setBoards] = useState<{ name: string; id: string; projectKey: string; type: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(() => {
    return localStorage.getItem("selected_project_key") || "";
  });
  const [selectedBoard, setSelectedBoard] = useState<string>(() => {
    return localStorage.getItem("selected_board_id") || "";
  });
  const [loadingBoards, setLoadingBoards] = useState(false);

  // Tracks programmatic board resets so we don't dispatch a second filter-change event
  const skipBoardDispatch = useRef(false);

  useEffect(() => {
    const projectLoader = async () => {
      try {
        const result = await getProjects();
        if (result && result.data && result.data.projects) {
          setProjects(result.data.projects);
        }
      } catch (error) {
        console.error("Failed to load projects:", error);
      }
    };
    projectLoader();
  }, []);

  useEffect(() => {
    localStorage.setItem("selected_project_key", selectedProject);
    // Clear the board from localStorage immediately so Dashboard reads
    // the correct (empty) board when this event fires, before the async
    // board-loader effect has a chance to reset selectedBoard state.
    localStorage.setItem("selected_board_id", "");
    window.dispatchEvent(new Event("jira-filters-changed"));
  }, [selectedProject]);

  useEffect(() => {
    localStorage.setItem("selected_board_id", selectedBoard);
    if (skipBoardDispatch.current) {
      skipBoardDispatch.current = false;
      return;
    }
    window.dispatchEvent(new Event("jira-filters-changed"));
  }, [selectedBoard]);

  // Only re-run when the project changes — not when the board changes
  useEffect(() => {
    const boardLoader = async () => {
      if (!selectedProject) {
        setBoards([]);
        if (selectedBoard !== "") {
          skipBoardDispatch.current = true;
          setSelectedBoard("");
        }
        setLoadingBoards(false);
        return;
      }
      setLoadingBoards(true);
      try {
        const result = await getBoards(selectedProject);
        if (result && result.data && result.data.boards) {
          const loadedBoards = result.data.boards;
          setBoards(loadedBoards);

          if (loadedBoards.length === 1) {
            // Auto-select the only board so stats display immediately.
            if (String(selectedBoard) !== String(loadedBoards[0].id)) {
              setSelectedBoard(String(loadedBoards[0].id));
            }
          } else {
            // Multiple or zero boards — clear an invalid selection.
            const boardExists = loadedBoards.some((b: { id: string }) => String(b.id) === String(selectedBoard));
            if (!boardExists && selectedBoard !== "") {
              skipBoardDispatch.current = true;
              setSelectedBoard("");
            }
          }
        }
      } catch (error) {
        console.error("Failed to load boards:", error);
        setBoards([]);
        if (selectedBoard !== "") {
          skipBoardDispatch.current = true;
          setSelectedBoard("");
        }
      } finally {
        setLoadingBoards(false);
      }
    };

    boardLoader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]);

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-2 border-b border-gray-100 bg-white text-sm text-gray-900">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="gf-projects" className="text-xs text-gray-900 whitespace-nowrap">
          Project
        </Label>
        <Select
          id="gf-projects"
          className="h-7 text-xs py-0 w-full"
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="">All Projects</option>
          {projects.map((proj) => (
            <option key={proj.key} value={proj.key}>
              {proj.name}
            </option>
          ))}
        </Select>
        <Label htmlFor="gf-board" className="text-xs text-gray-900 whitespace-nowrap">
          Boards
        </Label>
        <Select
          id="gf-board"
          className="h-7 text-xs py-0 w-full"
          value={selectedBoard}
          onChange={(e) => setSelectedBoard(e.target.value)}
          disabled={!selectedProject || loadingBoards}
        >
          <option value="">All boards</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}({board.type})
            </option>
          ))}
        </Select>
        {loadingBoards && (
          <span className="ml-2 text-xs text-gray-400 animate-pulse">Loading boards...</span>
        )}
      </div>
    </div>
  );
}