import {
  ChevronLeft,
  ChevronRight,
  GitCompare,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../utils/utils";
import { NavLink, useNavigate } from "react-router-dom";
import { Button } from "./Button";
import { Label } from "./Label";
import { logoutApi } from "../api/jira";
import { useFilter } from "../context/FilterContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/sprints", label: "Sprint Analytics", icon: Zap },
  { to: "/compare", label: "Sprint Compare", icon: GitCompare },
  { to: "/epics", label: "Epic Intelligence", icon: Map },
];

const name = localStorage.getItem("user_name")


export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const { clearFilters } = useFilter();

  const handleLogout = async () => {
    try {
      await logoutApi();
      clearFilters();
      localStorage.clear()
      navigate("/");
    } catch (error) {
      console.error("Failed to logout:", error);
    }
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-slate-900 text-white transition-all duration-300 relative shrink-0",
        collapsed ? "w-16" : "w-50",
      )}
    >
      <div className="flex items-center gap-3 px-4 py-5 borfer-b border-slate-700">
        <div className="shrink-0 w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
          <LayoutDashboard size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-bold leading-tight">Jira Intelligence</p>
          </div>
        )}
      </div>
      <div className="px-4 py-3 border-b border-slate-700">
        <div>
          <Label className="text-sm font-bold text-white leading-tight">{name}</Label>
        </div>
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map(({ to, label, icon: Icons, exact }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={exact}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-blue-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white",
                  )
                }
                title={collapsed ? label : undefined}
              >
                <Icons size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
       <div className="px-2 py-3 border-t border-slate-700">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              isActive
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            )
          }
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <Button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Logout</span>}
        </Button>
      </div>
      <Button
        name={
          collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={12} />
        }
        className={cn(
          "absolute -right-3 top-16 w-6 h-6 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-600 transition-colors",
        )}
        onClick={() => setCollapsed(!collapsed)}
      />
    </aside>
  );
};
