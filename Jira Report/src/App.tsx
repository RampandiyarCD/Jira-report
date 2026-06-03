import { lazy, Suspense } from "react"
import { Routes, Route, Outlet } from "react-router-dom"
import { Sidebar } from "./components/Sidebar"
import { GlobalFilters } from "./components/GlobalFilter"
import { FilterProvider } from "./context/FilterContext"

// Lazy load route pages (Named exports)
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })))
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })))
const EpicsPage = lazy(() => import("./pages/EpicPage").then((m) => ({ default: m.EpicsPage })))
const EpicDetailsPage = lazy(() => import("./pages/EpicDetailsPage").then((m) => ({ default: m.EpicDetailsPage })))
const SettingsPage = lazy(() => import("./pages/Settings").then((m) => ({ default: m.SettingsPage })))

// Lazy load route pages (Default export)
const ZephyrPage = lazy(() => import("./pages/ZephyrPage"))
const SprintAnalysis = lazy(() => import("./pages/SprintAnalysis"))

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
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen bg-slate-50">
            <div className="text-sm font-semibold text-slate-400 animate-pulse">Loading page...</div>
          </div>
        }
      >
        <Routes>
          <Route path="/" element={<Login />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sprints" element={<SprintAnalysis />} />
            <Route path="/epics" element={<EpicsPage />} />
            <Route path="/epics/:epicKey" element={<EpicDetailsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/zephyr/:issueKey" element={<ZephyrPage />} />
          </Route>
        </Routes>
      </Suspense>
    </FilterProvider>
  )
}

export default App