import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Sidebar from "./Sidebar";
import Topbar  from "./Topbar";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const qc = useQueryClient();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 relative">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar onRefresh={() => qc.invalidateQueries()} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
