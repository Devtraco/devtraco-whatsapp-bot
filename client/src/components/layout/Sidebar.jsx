import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Building2, MessageSquare,
  Calendar, Megaphone, Settings, LogOut, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LOGO = "https://devtracoplus.com/site/assets/files/1/devtracoplus_logo_298_x_125_-01.png";

const nav = [
  { to: "/app/overview",      icon: LayoutDashboard, label: "Overview"      },
  { to: "/app/leads",         icon: Users,           label: "Leads"         },
  { to: "/app/properties",    icon: Building2,       label: "Properties"    },
  { to: "/app/conversations", icon: MessageSquare,   label: "Conversations" },
  { to: "/app/viewings",      icon: Calendar,        label: "Viewings"      },
  { to: "/app/broadcasts",    icon: Megaphone,       label: "Broadcasts"    },
];

export default function Sidebar({ collapsed, onToggle }) {
  const navigate = useNavigate();

  function logout() {
    localStorage.removeItem("dt_token");
    navigate("/app/login");
  }

  return (
    <aside className={cn(
      "relative flex flex-col bg-navy-900 text-white transition-all duration-300 ease-in-out shrink-0",
      collapsed ? "w-16" : "w-60"
    )}>
      {/* Logo */}
      <div className={cn(
        "flex items-center h-16 border-b border-white/10 overflow-hidden transition-all",
        collapsed ? "px-3 justify-center" : "px-4 gap-3"
      )}>
        {collapsed ? (
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0">
            D+
          </div>
        ) : (
          <img
            src={LOGO}
            alt="Devtraco Plus"
            className="h-7 w-auto object-contain"
            onError={(e) => {
              e.target.style.display = "none";
              e.target.nextSibling.style.display = "flex";
            }}
          />
        )}
        {/* Fallback if logo fails */}
        {!collapsed && (
          <div className="hidden items-center gap-2">
            <div className="w-7 h-7 bg-brand-600 rounded-lg flex items-center justify-center font-bold text-xs">D+</div>
            <span className="font-semibold text-sm">Devtraco Plus</span>
          </div>
        )}
      </div>

      {/* Section label */}
      {!collapsed && (
        <p className="px-4 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">
          Command Centre
        </p>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto scrollbar-hide">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
              isActive
                ? "bg-brand-600 text-white shadow-sm shadow-brand-600/40"
                : "text-white/55 hover:bg-white/8 hover:text-white"
            )}
          >
            {({ isActive }) => (
              <>
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate flex-1">{label}</span>}
                {!collapsed && isActive && <ChevronRight size={13} className="opacity-60 shrink-0" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-4 space-y-0.5 border-t border-white/10 pt-3">
        <NavLink
          to="/app/settings"
          title={collapsed ? "Settings" : undefined}
          className={({ isActive }) => cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
            isActive ? "bg-brand-600 text-white" : "text-white/55 hover:bg-white/8 hover:text-white"
          )}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
        <button
          onClick={logout}
          title={collapsed ? "Sign out" : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/55 hover:bg-red-500/15 hover:text-red-400 transition-all"
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[68px] z-20 w-6 h-6 bg-navy-900 border border-white/20 rounded-full flex items-center justify-center text-white/50 hover:text-white transition-colors shadow-md"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <ChevronRight size={12} className={cn("transition-transform duration-300", collapsed ? "" : "rotate-180")} />
      </button>
    </aside>
  );
}
