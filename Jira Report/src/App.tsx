import { Routes, Route, Outlet } from "react-router-dom"
import { Login } from "./pages/Login"
import { Dashboard } from "./pages/Dashboard"
import { EpicsPage } from "./pages/EpicPage"
import { SettingsPage } from "./pages/Settings"
import { Sidebar } from "./components/Sidebar"
import { GlobalFilters } from "./components/GlobalFilter"
import { FilterProvider } from "./context/FilterContext"

const AppLayout = () => {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        <GlobalFilters />
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function App() {
  return (
    <FilterProvider>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/epics" element={<EpicsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </FilterProvider>
  )
}

export default App