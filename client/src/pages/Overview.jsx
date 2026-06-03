import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, Flame, Building2, Calendar, AlertTriangle,
  MessageSquare, TrendingUp, Zap, DollarSign, Target,
  ArrowUpRight, Clock, CheckCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtCurrency, fmtRelative, fmtPhone, avatarColor, initials } from "@/lib/utils";
import { StatCard, Card, CardHeader, CardBody, Badge, PageLoader, ScoreBar } from "@/components/ui";

const TIER_COLORS = { hot: "#ef4444", warm: "#f59e0b", cold: "#60a5fa" };

/* ── helpers ────────────────────────────────────────────── */
function buildTrend(leads) {
  const now = new Date();
  const days = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en", { weekday: "short" });
    days[key] = { day: key, leads: 0, hot: 0 };
  }
  leads.forEach((l) => {
    if (!l.firstContact) return;
    const d = new Date(l.firstContact);
    const diff = Math.floor((now - d) / 86400000);
    if (diff > 6) return;
    const key = d.toLocaleDateString("en", { weekday: "short" });
    if (days[key]) { days[key].leads++; if (l.tier === "hot") days[key].hot++; }
  });
  return Object.values(days);
}

function buildPropertyChart(leads) {
  const map = {};
  leads.forEach((l) => {
    const p = l.propertyInterest || "Not specified";
    map[p] = (map[p] || 0) + 1;
  });
  return Object.entries(map)
    .filter(([k]) => k !== "Not specified")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({
      name: name.length > 22 ? name.slice(0, 20) + "…" : name,
      value,
    }));
}

function computeInsights(leads, stats, viewings) {
  const total = leads.length || 1;
  const hot   = leads.filter((l) => l.tier === "hot");
  const warm  = leads.filter((l) => l.tier === "warm");
  const withEmail   = leads.filter((l) => l.email).length;
  const withViewing = viewings?.filter((v) => v.status !== "CANCELLED").length || 0;

  // Pipeline value: hot × $180k + warm × $83k (avg lowest property price)
  const pipelineValue = hot.length * 180000 + warm.length * 83000;

  // Conversion proxy: leads that booked a viewing
  const conversionRate = total > 0 ? ((withViewing / total) * 100).toFixed(1) : "0.0";

  // Most popular property
  const propMap = {};
  leads.forEach((l) => { if (l.propertyInterest) propMap[l.propertyInterest] = (propMap[l.propertyInterest] || 0) + 1; });
  const topProp = Object.entries(propMap).sort((a, b) => b[1] - a[1])[0];

  // Leads added today
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayLeads = leads.filter((l) => l.firstContact && new Date(l.firstContact) >= todayStart).length;

  // Overdue escalations (escalated > 1 hour ago without response)
  const overdueEscalations = leads.filter((l) =>
    l.state?.includes("ESCALATED") &&
    l.lastActivity &&
    (Date.now() - new Date(l.lastActivity)) > 3600000
  ).length;

  // Pending viewings older than 24h
  const overdueViewings = viewings?.filter((v) =>
    v.status === "PENDING" &&
    v.createdAt &&
    (Date.now() - new Date(v.createdAt)) > 86400000
  ).length || 0;

  const insights = [];

  if (overdueEscalations > 0)
    insights.push({ type: "urgent", icon: AlertTriangle, color: "red",
      text: `${overdueEscalations} escalation${overdueEscalations > 1 ? "s" : ""} waiting over 1 hour — contact now` });

  if (overdueViewings > 0)
    insights.push({ type: "urgent", icon: Clock, color: "amber",
      text: `${overdueViewings} viewing${overdueViewings > 1 ? "s" : ""} pending confirmation for 24h+` });

  if (hot.length > 0)
    insights.push({ type: "opportunity", icon: Flame, color: "red",
      text: `${hot.length} hot lead${hot.length > 1 ? "s" : ""} with score ≥80 — highest close probability` });

  if (topProp)
    insights.push({ type: "trend", icon: Building2, color: "brand",
      text: `"${topProp[0]}" is your most enquired property — ${topProp[1]} leads interested` });

  if (todayLeads > 0)
    insights.push({ type: "growth", icon: ArrowUpRight, color: "green",
      text: `${todayLeads} new lead${todayLeads > 1 ? "s" : ""} captured today` });

  if (withEmail > 0)
    insights.push({ type: "data", icon: CheckCircle, color: "green",
      text: `${withEmail} lead${withEmail > 1 ? "s have" : " has"} provided email — ready for follow-up` });

  if (conversionRate > 0)
    insights.push({ type: "metric", icon: Target, color: "brand",
      text: `Viewing conversion rate: ${conversionRate}% of all leads have scheduled a visit` });

  return { pipelineValue, conversionRate, topProp, todayLeads, insights };
}

/* ── component ─────────────────────────────────────────── */
export default function Overview() {
  const { data: stats,    isLoading: sLoading } = useQuery({ queryKey: ["stats"],    queryFn: api.stats,    refetchInterval: 30_000 });
  const { data: leadsData, isLoading: lLoading } = useQuery({ queryKey: ["leads"],    queryFn: api.leads,    refetchInterval: 60_000 });
  const { data: viewData }                       = useQuery({ queryKey: ["viewings"], queryFn: api.viewings, refetchInterval: 60_000 });

  if (sLoading || lLoading) return <PageLoader />;

  const leads    = leadsData?.leads    || [];
  const viewings = viewData?.viewings  || [];
  const trend    = buildTrend(leads);
  const propData = buildPropertyChart(leads);
  const hotLeads = leads.filter((l) => l.tier === "hot").slice(0, 5);
  const pending  = viewings.filter((v) => v.status === "PENDING").slice(0, 5);
  const escalations = leads.filter((l) => l.state?.includes("ESCALATED")).slice(0, 5);
  const { pipelineValue, conversionRate, insights } = computeInsights(leads, stats, viewings);

  const tierData = [
    { name: "Hot",  value: stats?.leads?.hot  || 0, color: TIER_COLORS.hot  },
    { name: "Warm", value: stats?.leads?.warm || 0, color: TIER_COLORS.warm },
    { name: "Cold", value: stats?.leads?.cold || 0, color: TIER_COLORS.cold },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">

      {/* ── KPI row 1 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Leads"      value={stats?.leads?.total || 0}    icon={Users}        color="brand" sub={`${stats?.activeSessions || 0} active right now`} />
        <StatCard label="🔥 Hot Leads"     value={stats?.leads?.hot  || 0}    icon={Flame}        color="red"   sub="Score ≥ 80 — close ready" />
        <StatCard label="Pending Viewings" value={stats?.pendingViewings || 0} icon={Calendar}     color="purple" sub="Awaiting confirmation" />
        <StatCard label="Pipeline Value"   value={fmtCurrency(pipelineValue)}  icon={DollarSign}   color="green" sub="Estimated from hot + warm leads" />
      </div>

      {/* ── KPI row 2 ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Warm Leads"      value={stats?.leads?.warm || 0}    icon={TrendingUp}   color="amber" sub="Score 50–79" />
        <StatCard label="Total Messages"  value={(stats?.totalMessages || 0).toLocaleString()} icon={MessageSquare} color="blue" sub="All conversations" />
        <StatCard label="Escalations"     value={stats?.escalated || 0}      icon={AlertTriangle} color="red"   sub={`${stats?.awaitingAgent || 0} awaiting agent`} />
        <StatCard label="Conversion Rate" value={`${conversionRate}%`}       icon={Target}        color="brand" sub="Leads that booked a viewing" />
      </div>

      {/* ── AI Intelligence Panel ── */}
      {insights.length > 0 && (
        <Card className="border-brand-200 bg-gradient-to-r from-brand-50 to-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
              <p className="font-semibold text-slate-900 text-sm">AI Intelligence</p>
            </div>
            <p className="text-xs text-slate-400">Live analysis of your leads and pipeline</p>
          </CardHeader>
          <CardBody className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {insights.map((ins, i) => {
                const colorMap = {
                  red:   "bg-red-50 border-red-200 text-red-700",
                  amber: "bg-amber-50 border-amber-200 text-amber-700",
                  green: "bg-emerald-50 border-emerald-200 text-emerald-700",
                  brand: "bg-brand-50 border-brand-200 text-brand-700",
                };
                const iconColor = {
                  red: "text-red-500", amber: "text-amber-500",
                  green: "text-emerald-500", brand: "text-brand-500",
                };
                return (
                  <div key={i} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border text-sm ${colorMap[ins.color] || colorMap.brand}`}>
                    <ins.icon size={15} className={`shrink-0 mt-0.5 ${iconColor[ins.color]}`} />
                    <span>{ins.text}</span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead trend */}
        <Card className="lg:col-span-2">
          <CardHeader action={<Badge variant="teal">Last 7 days</Badge>}>
            <p className="font-semibold text-slate-900 text-sm">Lead Activity Trend</p>
            <p className="text-xs text-slate-400">New leads and hot leads per day</p>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={trend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#c9920e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#c9920e" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gHot" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.07)" }} />
                <Area type="monotone" dataKey="leads" stroke="#c9920e" strokeWidth={2.5} fill="url(#gLeads)" name="All Leads" dot={false} />
                <Area type="monotone" dataKey="hot"   stroke="#ef4444" strokeWidth={2}   fill="url(#gHot)"   name="Hot Leads" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Tier donut */}
        <Card>
          <CardHeader>
            <p className="font-semibold text-slate-900 text-sm">Lead Quality</p>
            <p className="text-xs text-slate-400">Distribution by tier</p>
          </CardHeader>
          <CardBody className="flex flex-col items-center pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={tierData} cx="50%" cy="50%" innerRadius={50} outerRadius={72} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {tierData.map((t) => <Cell key={t.name} fill={t.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} leads`, n]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex gap-5 mt-1">
              {tierData.map((t) => (
                <div key={t.name} className="flex flex-col items-center gap-1">
                  <span className="text-xl font-bold tabular-nums" style={{ color: t.color }}>{t.value}</span>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />
                    {t.name}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ── Property interest chart ── */}
      {propData.length > 0 && (
        <Card>
          <CardHeader>
            <p className="font-semibold text-slate-900 text-sm">Property Interest Breakdown</p>
            <p className="text-xs text-slate-400">Number of leads enquiring per property</p>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={propData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={130} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="value" fill="#c9920e" radius={[0, 6, 6, 0]} name="Enquiries" maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      )}

      {/* ── Hot leads + Pending viewings + Escalations ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hot leads */}
        <Card>
          <CardHeader action={<Badge variant="red" dot>{hotLeads.length}</Badge>}>
            <p className="font-semibold text-slate-900 text-sm">🔥 Hot Leads</p>
            <p className="text-xs text-slate-400">Act immediately</p>
          </CardHeader>
          {hotLeads.length === 0 ? (
            <CardBody><p className="text-sm text-slate-400 text-center py-6">No hot leads yet</p></CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hotLeads.map((l) => (
                <li key={l.userId} className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${avatarColor(l.name || l.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {initials(l.name || l.userId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{l.name || fmtPhone(l.userId)}</p>
                    <p className="text-xs text-slate-400 truncate">{l.propertyInterest || "No property specified"}</p>
                  </div>
                  <div className="shrink-0 w-16"><ScoreBar score={l.score} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Pending viewings */}
        <Card>
          <CardHeader action={<Badge variant="purple" dot>{pending.length}</Badge>}>
            <p className="font-semibold text-slate-900 text-sm">Pending Viewings</p>
            <p className="text-xs text-slate-400">Awaiting confirmation</p>
          </CardHeader>
          {pending.length === 0 ? (
            <CardBody><p className="text-sm text-slate-400 text-center py-6">No pending viewings</p></CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.map((v, i) => (
                <li key={v.viewingId || i} className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800 truncate">{v.name || fmtPhone(v.userId)}</p>
                  <p className="text-xs text-slate-400 truncate">{v.propertyName} · {v.preferredDate} {v.preferredTime}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Escalations */}
        <Card>
          <CardHeader action={<Badge variant={escalations.length > 0 ? "red" : "green"}>{escalations.length}</Badge>}>
            <p className="font-semibold text-slate-900 text-sm">⚠️ Escalations</p>
            <p className="text-xs text-slate-400">Needs human attention</p>
          </CardHeader>
          {escalations.length === 0 ? (
            <CardBody><p className="text-sm text-slate-400 text-center py-6">All clear — no escalations</p></CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {escalations.map((l) => (
                <li key={l.userId} className="px-4 py-3 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${avatarColor(l.name || l.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {initials(l.name || l.userId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{l.name || fmtPhone(l.userId)}</p>
                    <p className="text-xs text-slate-400">{fmtRelative(l.lastActivity)}</p>
                  </div>
                  <Badge variant="red">Escalated</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
