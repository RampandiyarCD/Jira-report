import { Routes, Route, Outlet } from "react-router-dom"
import { Login } from "./pages/Login"
import { Dashboard } from "./pages/Dashboard"
import { EpicsPage } from "./pages/EpicPage"
import { Sidebar } from "./components/Sidebar"

const AppLayout = () => {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  )
}

function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/epics" element={<EpicsPage />} />
        </Route>
      </Routes>
    </div>
  )
}

export default App