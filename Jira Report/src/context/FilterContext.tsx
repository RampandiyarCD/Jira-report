import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface FilterContextType {
  selectedProject: string;
  selectedBoard: string;
  setSelectedProject: (project: string) => void;
  setSelectedBoard: (board: string) => void;
  clearFilters: () => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [selectedProject, setSelectedProject] = useState<string>(() => {
    return localStorage.getItem("selected_project_key") || "";
  });
  const [selectedBoard, setSelectedBoard] = useState<string>(() => {
    return localStorage.getItem("selected_board_id") || "";
  });

  useEffect(() => {
    if (selectedProject) {
      localStorage.setItem("selected_project_key", selectedProject);
    } else {
      localStorage.removeItem("selected_project_key");
    }
  }, [selectedProject]);

  useEffect(() => {
    if (selectedBoard) {
      localStorage.setItem("selected_board_id", selectedBoard);
    } else {
      localStorage.removeItem("selected_board_id");
    }
  }, [selectedBoard]);

  const clearFilters = () => {
    setSelectedProject("");
    setSelectedBoard("");
  };

  return (
    <FilterContext.Provider
      value={{
        selectedProject,
        selectedBoard,
        setSelectedProject,
        setSelectedBoard,
        clearFilters,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error("useFilter must be used within a FilterProvider");
  }
  return context;
}
