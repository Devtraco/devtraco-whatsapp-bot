import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, X, Phone, Mail, MapPin, MessageSquare, TrendingUp, Star } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtDateTime, fmtPhone, truncate, avatarColor, initials, tierColor } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CardBody, PageLoader, Empty, ScoreBar, Modal } from "@/components/ui";

const TIERS = ["all", "hot", "warm", "cold"];
const TIER_LABELS = { all: "All Leads", hot: "🔥 Hot", warm: "🌡 Warm", cold: "❄️ Cold" };

function tierVariant(tier) {
  return { hot: "red", warm: "amber", cold: "blue" }[tier] || "default";
}

function stateBadge(state) {
  if (state?.startsWith("ESCALATED")) return "red";
  if (state === "ACTIVE" || state === "AWAITING_PRODUCT_INTENT") return "green";
  return "slate";
}

function stateLabel(state) {
  const map = {
    ACTIVE: "Active", ESCALATED: "Escalated", GREETING: "Greeting",
    AWAITING_NAME: "Collecting name", AWAITING_COUNTRY: "Collecting country",
    AWAITING_EMAIL: "Collecting email", AWAITING_PRODUCT_INTENT: "Choosing interest",
  };
  return map[state] || state || "—";
}

function exportCSV(leads) {
  const rows = [
    ["Name","Phone","Score","Tier","State","Property","Country","Email","Last Active"],
    ...leads.map((l) => [
      l.name || "", l.userId, l.score, l.tier, l.state,
      l.propertyInterest || "", l.country || "", l.email || "",
      l.lastActivity ? new Date(l.lastActivity).toISOString() : "",
    ]),
  ];
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "leads.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function Leads() {
  const [tier, setTier] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState({ key: "score", dir: "desc" });

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
      const va = a[sort.key] ?? 0, vb = b[sort.key] ?? 0;
      if (typeof va === "string") return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sort.dir === "asc" ? va - vb : vb - va;
    });

  function toggleSort(key) {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }

  function SortTh({ col, label }) {
    const active = sort.key === col;
    return (
      <th
        className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer select-none hover:text-slate-700"
        onClick={() => toggleSort(col)}
      >
        {label} {active ? (sort.dir === "asc" ? "↑" : "↓") : ""}
      </th>
    );
  }

  if (isLoading) return <PageLoader />;

  const hotCount  = leads.filter((l) => l.tier === "hot").length;
  const warmCount = leads.filter((l) => l.tier === "warm").length;
  const coldCount = leads.filter((l) => l.tier === "cold").length;
  const avgScore  = leads.length ? Math.round(leads.reduce((a, l) => a + l.score, 0) / leads.length) : 0;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: leads.length, color: "text-slate-900" },
          { label: "🔥 Hot",  value: hotCount,  color: "text-red-600"   },
          { label: "🌡 Warm", value: warmCount, color: "text-amber-600" },
          { label: "❄️ Cold", value: coldCount, color: "text-blue-500"  },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <p className="text-xs text-slate-400 font-medium mb-1">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader
          action={
            <Button variant="secondary" size="sm" icon={Download} onClick={() => exportCSV(filtered)}>
              Export CSV
            </Button>
          }
        >
          <p className="font-semibold text-slate-900">All Leads</p>
          <p className="text-xs text-slate-400">{filtered.length} of {leads.length} · Avg score {avgScore}</p>
        </CardHeader>

        {/* Filters */}
        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, property…"
              className="w-full pl-8 pr-8 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13} /></button>}
          </div>
          <div className="flex gap-1">
            {TIERS.map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tier === t ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {TIER_LABELS[t]}
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
                <SortTh col="score" label="Score" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Tier</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Property Interest</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">Country</th>
                <SortTh col="lastActivity" label="Last Active" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-slate-400 text-sm">No leads match your filters</td></tr>
              ) : filtered.map((l) => (
                <tr key={l.userId} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setSelected(l)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${avatarColor(l.name || l.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {initials(l.name || l.userId)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{l.name || "—"}</p>
                        <p className="text-xs text-slate-400">{fmtPhone(l.userId)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 w-32">
                    <ScoreBar score={l.score} />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={tierVariant(l.tier)}>{l.tier?.toUpperCase()}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={stateBadge(l.state)}>{stateLabel(l.state)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-[200px]">
                    <p className="truncate">{l.propertyInterest || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{l.country || "—"}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmtRelative(l.lastActivity)}</td>
                  <td className="px-4 py-3">
                    <button className="text-brand-600 hover:text-brand-700 text-xs font-medium">View →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Lead detail drawer */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={null} width="max-w-2xl">
        {selected && (
          <div className="flex flex-col">
            {/* Lead header */}
            <div className="px-6 py-5 bg-gradient-to-r from-navy-900 to-brand-900 text-white rounded-t-2xl">
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl ${avatarColor(selected.name || selected.userId)} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                  {initials(selected.name || selected.userId)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold">{selected.name || "Unknown"}</h3>
                  <p className="text-white/70 text-sm mt-0.5">{fmtPhone(selected.userId)}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <Badge variant={tierVariant(selected.tier)} className="bg-white/20 text-white border-0">
                      {selected.tier?.toUpperCase()} · {selected.score}
                    </Badge>
                    <Badge className="bg-white/20 text-white border-0">{stateLabel(selected.state)}</Badge>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-white/50 uppercase tracking-wide mb-1">Lead Score</p>
                  <p className="text-4xl font-black tabular-nums">{selected.score}</p>
                </div>
              </div>
            </div>

            {/* Details grid */}
            <div className="px-6 py-5 grid grid-cols-2 gap-4 border-b border-slate-100">
              {[
                { icon: MapPin, label: "Country", value: selected.country },
                { icon: Mail, label: "Email", value: selected.email },
                { icon: Star, label: "Property Interest", value: selected.propertyInterest },
                { icon: TrendingUp, label: "Budget", value: selected.budget },
                { icon: MessageSquare, label: "Messages", value: selected.messageCount },
                { icon: Phone, label: "First Contact", value: fmtDateTime(selected.firstContact) },
              ].map(({ icon: Ic, label, value }) => (
                <div key={label} className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Ic size={13} className="text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-medium">{label}</p>
                    <p className="text-sm font-semibold text-slate-800 truncate">{value || "—"}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Conversation */}
            <div className="px-6 py-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Conversation</p>
              {!convo ? (
                <p className="text-sm text-slate-400 py-4 text-center">Loading…</p>
              ) : convo.history?.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No messages yet</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {convo.history.slice(-20).map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug ${
                        m.role === "user"
                          ? "bg-brand-600 text-white rounded-br-sm"
                          : "bg-slate-100 text-slate-800 rounded-bl-sm"
                      }`}>
                        {truncate(m.content, 200)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 pb-5 flex gap-2 justify-end border-t border-slate-100 pt-4">
              <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
