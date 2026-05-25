import { Select } from './Select'
import { Label } from './Label'
import { getBoards, getProjects } from '../api/jira'
import { useEffect, useState } from 'react';
import { useFilter } from '../context/FilterContext';

export function GlobalFilters() {
  const [projects, setProjects] = useState<{ name: string; key: string }[]>([]);
  const [boards, setBoards] = useState<{ name: string; id: string; projectKey: string; type: string }[]>([]);
  const { selectedProject, selectedBoard, setSelectedProject, setSelectedBoard } = useFilter();

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

  useEffect(() => {
    projectLoader();
  }, []);

  useEffect(() => {
    const boardLoader = async () => {
      if (!selectedProject) {
        setBoards([]);
        setSelectedBoard("");
        return;
      }
      try {
        const result = await getBoards(selectedProject);
        if (result && result.data && result.data.boards) {
          const loadedBoards = result.data.boards;
          setBoards(loadedBoards);
          const boardExists = loadedBoards.some((b: any) => String(b.id) === String(selectedBoard));
          if (!boardExists) {
            setSelectedBoard("");
          }
        }
      } catch (error) {
        console.error("Failed to load boards:", error);
        setBoards([]);
        setSelectedBoard("");
      }
    };

    boardLoader();
  }, [selectedProject]);

  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-2 border-b border-gray-100 bg-white text-sm">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="gf-projects" className="text-xs text-gray-500 whitespace-nowrap">
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
        <Label htmlFor="gf-board" className="text-xs text-gray-500 whitespace-nowrap">
          Boards
        </Label>
        <Select
          id="gf-board"
          className="h-7 text-xs py-0 w-full"
          value={selectedBoard}
          onChange={(e) => setSelectedBoard(e.target.value)}
          disabled={!selectedProject}
        >
          <option value="">All boards</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name}({board.type})
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}