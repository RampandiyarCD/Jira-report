import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface FilterContextType {
  selectedProject: string;
  selectedBoard: string;
  dateFrom: string;
  dateTo: string;
  setSelectedProject: (project: string) => void;
  setSelectedBoard: (board: string) => void;
  setDateFrom: (d: string) => void;
  setDateTo: (d: string) => void;
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
  const [dateFrom, setDateFromState] = useState<string>(() => localStorage.getItem("filter_date_from") || "");
  const [dateTo, setDateToState] = useState<string>(() => localStorage.getItem("filter_date_to") || "");

  const setDateFrom = (d: string) => setDateFromState(d);
  const setDateTo = (d: string) => setDateToState(d);

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

  useEffect(() => {
    if (dateFrom) localStorage.setItem("filter_date_from", dateFrom);
    else localStorage.removeItem("filter_date_from");
  }, [dateFrom]);

  useEffect(() => {
    if (dateTo) localStorage.setItem("filter_date_to", dateTo);
    else localStorage.removeItem("filter_date_to");
  }, [dateTo]);

  const clearFilters = () => {
    setSelectedProject("");
    setSelectedBoard("");
    setDateFromState("");
    setDateToState("");
  };

  return (
    <FilterContext.Provider
      value={{
        selectedProject,
        selectedBoard,
        dateFrom,
        dateTo,
        setSelectedProject,
        setSelectedBoard,
        setDateFrom,
        setDateTo,
        clearFilters,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFilter() {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error("useFilter must be used within a FilterProvider");
  }
  return context;
}
