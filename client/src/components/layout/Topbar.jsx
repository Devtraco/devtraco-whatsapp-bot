import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { api } from "@/lib/api";

const titles = {
  "/app/overview":      "Overview",
  "/app/leads":         "Leads",
  "/app/properties":    "Properties",
  "/app/conversations": "Conversations",
  "/app/viewings":      "Viewings",
  "/app/broadcasts":    "Broadcasts",
  "/app/settings":      "Settings",
};

export default function Topbar({ onRefresh }) {
  const { pathname } = useLocation();
  const title = titles[pathname] || "Dashboard";

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 60_000,
  });

  const isOnline = !!health?.status;

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 z-10">
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-slate-900 truncate">{title}</h1>
        <p className="text-xs text-slate-400 hidden sm:block">
          Devtraco Plus · Real Estate Intelligence
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Live indicator */}
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {isOnline ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-emerald-600 hidden sm:inline">Live</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-300" />
              <span className="text-slate-400 hidden sm:inline">Offline</span>
            </>
          )}
        </div>

        <button
          onClick={onRefresh}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          title="Refresh data"
        >
          <RefreshCw size={16} />
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
          A
        </div>
      </div>
    </header>
  );
}
