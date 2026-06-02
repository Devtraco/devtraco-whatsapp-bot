import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, X, Phone, Mail, MapPin, MessageSquare, TrendingUp, Star, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtDateTime, fmtPhone, truncate, avatarColor, initials } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, PageLoader, Empty, ScoreBar, Modal } from "@/components/ui";

const TIER_LABELS = { all: "All Leads", hot: "🔥 Hot", warm: "🌡 Warm", cold: "❄️ Cold" };

const TIER_VARIANT = { hot: "red", warm: "amber", cold: "blue" };

function stateBadgeVariant(state) {
  if (!state) return "slate";
  if (state.includes("ESCALATED")) return "red";
  if (state === "ACTIVE" || state === "AWAITING_PRODUCT_INTENT") return "green";
  return "slate";
}

function stateLabel(state) {
  const map = {
    ACTIVE: "Active", ESCALATED: "Escalated", GREETING: "Greeting",
    AWAITING_NAME: "Collecting name", AWAITING_COUNTRY: "Collecting country",
    AWAITING_EMAIL: "Collecting email", AWAITING_PRODUCT_INTENT: "Choosing interest",
  };
  return map[state] || (state?.replace(/_/g, " ") ?? "—");
}

function exportCSV(leads) {
  const header = ["Name", "Phone", "Score", "Tier", "State", "Property Interest", "Country", "Email", "Budget", "Messages", "First Contact", "Last Active"];
  const rows = leads.map((l) => [
    l.name || "", l.userId, l.score, l.tier, l.state,
    l.propertyInterest || "", l.country || "", l.email || "", l.budget || "",
    l.messageCount || 0,
    l.firstContact ? new Date(l.firstContact).toISOString() : "",
    l.lastActivity ? new Date(l.lastActivity).toISOString() : "",
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = `devtraco-leads-${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function Leads() {
  const [tier,     setTier]     = useState("all");
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const [sortKey,  setSortKey]  = useState("score");
  const [sortDir,  setSortDir]  = useState("desc");

  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: api.leads, refetchInterval: 60_000 });
  const { data: convo } = useQuery({
    queryKey: ["conversation", selected?.userId],
    queryFn: () => api.conversation(selected.userId),
    enabled: !!selected,
  });

  const leads = data?.leads || [];

  const filtered = leads
    .filter((l) => tier === "all" || l.tier === tier)
    .filter((l) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        l.name?.toLowerCase().includes(q) ||
        String(l.userId).includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.propertyInterest?.toLowerCase().includes(q) ||
        l.country?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === "lastActivity" || sortKey === "firstContact") {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
    });

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function SortTh({ col, label, className = "" }) {
    const active = sortKey === col;
    return (
      <th onClick={() => toggleSort(col)}
        className={`px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700 transition-colors ${className}`}>
        {label}{active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  if (isLoading) return <PageLoader />;

  const hotCount  = leads.filter((l) => l.tier === "hot").length;
  const warmCount = leads.filter((l) => l.tier === "warm").length;
  const coldCount = leads.filter((l) => l.tier === "cold").length;
  const avgScore  = leads.length ? Math.round(leads.reduce((a, l) => a + (l.score || 0), 0) / leads.length) : 0;

  return (
    <div className="space-y-5 max-w-[1400px]">

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: leads.length, color: "text-slate-900" },
          { label: "🔥 Hot",  value: hotCount,  color: "text-red-600"   },
          { label: "🌡 Warm", value: warmCount, color: "text-amber-600" },
          { label: "❄️ Cold", value: coldCount, color: "text-blue-500"  },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-card text-center">
            <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader action={
          <Button variant="secondary" size="sm" icon={Download} onClick={() => exportCSV(filtered)}>
            Export CSV
          </Button>
        }>
          <p className="font-semibold text-slate-900">All Leads</p>
          <p className="text-xs text-slate-400">{filtered.length} of {leads.length} shown · Avg score {avgScore}</p>
        </CardHeader>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-44">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, property, country…"
              className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-white" />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex gap-1">
            {Object.entries(TIER_LABELS).map(([t, label]) => (
              <button key={t} onClick={() => setTier(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tier === t ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Lead</th>
                <SortTh col="score" label="Score" className="w-36" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Property Interest</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Country</th>
                <SortTh col="lastActivity" label="Last Active" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-16">
                  <Empty icon={Search} title="No leads match your filters" description="Try adjusting your search or tier filter." />
                </td></tr>
              ) : filtered.map((l) => (
                <tr key={l.userId}
                  onClick={() => setSelected(l)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${avatarColor(l.name || l.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {initials(l.name || l.userId)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate group-hover:text-brand-700">{l.name || "—"}</p>
                        <p className="text-xs text-slate-400">{fmtPhone(l.userId)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 w-36"><ScoreBar score={l.score} /></td>
                  <td className="px-4 py-3">
                    <Badge variant={TIER_VARIANT[l.tier] || "default"}>{l.tier?.toUpperCase() || "—"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={stateBadgeVariant(l.state)}>{stateLabel(l.state)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px]">
                    <p className="truncate">{l.propertyInterest || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{l.country || "—"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtRelative(l.lastActivity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Lead detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} width="max-w-xl">
        {selected && (
          <>
            {/* Header */}
            <div className="bg-gradient-to-br from-navy-900 to-navy-800 px-6 py-5 rounded-t-2xl">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl ${avatarColor(selected.name || selected.userId)} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                  {initials(selected.name || selected.userId)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-white truncate">{selected.name || "Unknown"}</h3>
                  <p className="text-white/60 text-sm">{fmtPhone(selected.userId)}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Badge variant={TIER_VARIANT[selected.tier]} className="text-xs">{selected.tier?.toUpperCase()} · Score {selected.score}</Badge>
                    <Badge className="bg-white/15 text-white/90 border-0 text-xs">{stateLabel(selected.state)}</Badge>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-white/40 uppercase tracking-wide mb-1">Score</p>
                  <p className="text-4xl font-black text-white tabular-nums">{selected.score}</p>
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div className="px-6 py-4 grid grid-cols-2 gap-3 border-b border-slate-100">
              {[
                { icon: MapPin,        label: "Country",          value: selected.country },
                { icon: Mail,          label: "Email",            value: selected.email },
                { icon: Star,          label: "Property Interest", value: selected.propertyInterest },
                { icon: TrendingUp,    label: "Budget",           value: selected.budget },
                { icon: MessageSquare, label: "Messages",         value: selected.messageCount },
                { icon: Calendar,      label: "First Contact",    value: fmtDateTime(selected.firstContact) },
              ].map(({ icon: Ic, label, value }) => (
                <div key={label} className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Ic size={13} className="text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="text-sm font-semibold text-slate-800 truncate">{value || "—"}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Chat preview */}
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Recent Conversation</p>
              {!convo ? (
                <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
              ) : !convo.history?.length ? (
                <p className="text-sm text-slate-400 py-4 text-center">No messages yet</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {convo.history.slice(-14).map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[82%] px-3 py-2 rounded-2xl text-sm leading-snug ${
                        m.role === "user"
                          ? "bg-brand-600 text-white rounded-br-sm"
                          : "bg-slate-100 text-slate-800 rounded-bl-sm"
                      }`}>
                        {truncate(m.content, 180)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 pb-5 flex justify-end border-t border-slate-100 pt-4">
              <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
