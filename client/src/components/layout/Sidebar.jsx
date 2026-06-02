import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Building2, MessageSquare,
  Calendar, Megaphone, Settings, LogOut, Bot, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/app/overview",      icon: LayoutDashboard, label: "Overview" },
  { to: "/app/leads",         icon: Users,           label: "Leads" },
  { to: "/app/properties",    icon: Building2,       label: "Properties" },
  { to: "/app/conversations", icon: MessageSquare,   label: "Conversations" },
  { to: "/app/viewings",      icon: Calendar,        label: "Viewings" },
  { to: "/app/broadcasts",    icon: Megaphone,       label: "Broadcasts" },
];

export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("dt_token");
    navigate("/app/login");
  }

  return (
    <aside
      className={cn(
        "flex flex-col bg-navy-900 text-white transition-all duration-300 ease-in-out shrink-0",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10">
        <div className="shrink-0 w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center font-bold text-sm">
          D+
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">Devtraco Plus</p>
            <p className="text-white/40 text-xs">Command Centre</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto scrollbar-hide">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group",
                isActive
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-white/60 hover:bg-white/8 hover:text-white"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
                {!collapsed && isActive && (
                  <ChevronRight size={14} className="ml-auto opacity-70" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-4 space-y-0.5 border-t border-white/10 pt-3">
        <NavLink
          to="/app/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
              isActive ? "bg-brand-600 text-white" : "text-white/60 hover:bg-white/8 hover:text-white"
            )
          }
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/60 hover:bg-red-500/15 hover:text-red-400 transition-all"
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[72px] w-6 h-6 bg-navy-900 border border-white/20 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-colors z-10"
        title={collapsed ? "Expand" : "Collapse"}
      >
        <ChevronRight size={12} className={cn("transition-transform", collapsed ? "" : "rotate-180")} />
      </button>
    </aside>
  );
}
