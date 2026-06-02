import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Users, Flame, TrendingUp, Building2, Calendar,
  AlertTriangle, MessageSquare, Activity,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtPhone, truncate, avatarColor, initials } from "@/lib/utils";
import {
  StatCard, Card, CardHeader, CardBody, Badge, PageLoader, ScoreBar,
} from "@/components/ui";

const TIER_COLORS = { hot: "#ef4444", warm: "#f59e0b", cold: "#60a5fa" };
const CHART_COLORS = ["#0d9488", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];

function buildTrendData(leads) {
  const map = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("en", { weekday: "short" });
    map[key] = { day: key, leads: 0, hot: 0 };
  }
  leads.forEach((l) => {
    if (!l.firstContact) return;
    const d = new Date(l.firstContact);
    const diff = Math.floor((now - d) / 86400000);
    if (diff > 6) return;
    const key = d.toLocaleDateString("en", { weekday: "short" });
    if (map[key]) {
      map[key].leads++;
      if (l.tier === "hot") map[key].hot++;
    }
  });
  return Object.values(map);
}

function buildPropertyData(leads) {
  const map = {};
  leads.forEach((l) => {
    const prop = l.propertyInterest || "Unknown";
    map[prop] = (map[prop] || 0) + 1;
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, value]) => ({ name: name.length > 20 ? name.slice(0, 18) + "…" : name, value }));
}

export default function Overview() {
  const { data: stats, isLoading: sLoading } = useQuery({ queryKey: ["stats"], queryFn: api.stats, refetchInterval: 30_000 });
  const { data: leadsData, isLoading: lLoading } = useQuery({ queryKey: ["leads"], queryFn: api.leads, refetchInterval: 60_000 });
  const { data: viewingsData } = useQuery({ queryKey: ["viewings"], queryFn: api.viewings });

  if (sLoading || lLoading) return <PageLoader />;

  const leads = leadsData?.leads || [];
  const viewings = viewingsData?.viewings || [];
  const trendData = buildTrendData(leads);
  const propertyData = buildPropertyData(leads);
  const hotLeads = leads.filter((l) => l.tier === "hot").slice(0, 5);
  const escalations = leads.filter((l) => l.state?.startsWith("ESCALATED")).slice(0, 5);
  const pendingViewings = viewings.filter((v) => v.status === "pending").slice(0, 5);

  const tierData = [
    { name: "Hot",  value: stats?.leads?.hot  || 0, color: TIER_COLORS.hot },
    { name: "Warm", value: stats?.leads?.warm || 0, color: TIER_COLORS.warm },
    { name: "Cold", value: stats?.leads?.cold || 0, color: TIER_COLORS.cold },
  ];

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4">
        <StatCard label="Total Leads" value={stats?.leads?.total || 0} icon={Users} color="brand"
          sub={`${stats?.activeSessions || 0} active sessions`} />
        <StatCard label="Hot Leads" value={stats?.leads?.hot || 0} icon={Flame} color="red"
          sub="Score ≥ 80 — ready to close" />
        <StatCard label="Pending Viewings" value={stats?.pendingViewings || 0} icon={Calendar} color="purple"
          sub="Awaiting confirmation" />
        <StatCard label="Properties" value={stats?.properties || 0} icon={Building2} color="brand"
          sub="Active in portfolio" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Warm Leads" value={stats?.leads?.warm || 0} icon={TrendingUp} color="amber"
          sub="Score 50–79" />
        <StatCard label="Total Messages" value={stats?.totalMessages || 0} icon={MessageSquare} color="blue"
          sub="Across all conversations" />
        <StatCard label="Escalations" value={stats?.escalated || 0} icon={AlertTriangle} color="red"
          sub={`${stats?.awaitingAgent || 0} awaiting agent`} />
        <StatCard label="Active Now" value={stats?.activeSessions || 0} icon={Activity} color="green"
          sub="Live conversations" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead trend */}
        <Card className="lg:col-span-2">
          <CardHeader action={<Badge variant="teal">7 days</Badge>}>
            <p className="font-semibold text-slate-900 text-sm">Lead Activity</p>
            <p className="text-xs text-slate-400">New leads and hot leads per day</p>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0d9488" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gHot" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Area type="monotone" dataKey="leads" stroke="#0d9488" strokeWidth={2} fill="url(#gLeads)" name="All Leads" />
                <Area type="monotone" dataKey="hot"   stroke="#ef4444" strokeWidth={2} fill="url(#gHot)"   name="Hot Leads" />
              </AreaChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Tier donut */}
        <Card>
          <CardHeader>
            <p className="font-semibold text-slate-900 text-sm">Lead Quality</p>
            <p className="text-xs text-slate-400">By temperature tier</p>
          </CardHeader>
          <CardBody className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={tierData} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={3} dataKey="value">
                  {tierData.map((t) => <Cell key={t.name} fill={t.color} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} leads`, n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-2">
              {tierData.map((t) => (
                <div key={t.name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                  <span className="text-slate-600">{t.name}</span>
                  <span className="font-semibold tabular-nums">{t.value}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Property interest + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Property interest */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <p className="font-semibold text-slate-900 text-sm">Property Interest</p>
            <p className="text-xs text-slate-400">Most inquired properties</p>
          </CardHeader>
          <CardBody>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={propertyData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={120} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
                <Bar dataKey="value" fill="#0d9488" radius={[0, 4, 4, 0]} name="Inquiries" />
              </BarChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        {/* Pending viewings */}
        <Card>
          <CardHeader action={<Badge variant="purple" dot>{pendingViewings.length}</Badge>}>
            <p className="font-semibold text-slate-900 text-sm">Pending Viewings</p>
          </CardHeader>
          {pendingViewings.length === 0 ? (
            <CardBody><p className="text-sm text-slate-400 text-center py-6">No pending viewings</p></CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendingViewings.map((v) => (
                <li key={v.id} className="px-5 py-3">
                  <p className="text-sm font-medium text-slate-800 truncate">{v.name || fmtPhone(v.userId)}</p>
                  <p className="text-xs text-slate-400 truncate">{v.propertyName} · {v.preferredDate}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Hot leads + escalations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hot leads */}
        <Card>
          <CardHeader action={<Badge variant="red" dot>{hotLeads.length}</Badge>}>
            <p className="font-semibold text-slate-900 text-sm">🔥 Hot Leads</p>
            <p className="text-xs text-slate-400">Score ≥ 80 — act now</p>
          </CardHeader>
          {hotLeads.length === 0 ? (
            <CardBody><p className="text-sm text-slate-400 text-center py-6">No hot leads yet</p></CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {hotLeads.map((l) => (
                <li key={l.userId} className="px-5 py-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${avatarColor(l.name || l.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {initials(l.name || l.userId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{l.name || fmtPhone(l.userId)}</p>
                    <p className="text-xs text-slate-400 truncate">{l.propertyInterest || "No property specified"}</p>
                  </div>
                  <div className="shrink-0 w-20">
                    <ScoreBar score={l.score} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Escalations */}
        <Card>
          <CardHeader action={<Badge variant="red">{escalations.length}</Badge>}>
            <p className="font-semibold text-slate-900 text-sm">⚠️ Escalations</p>
            <p className="text-xs text-slate-400">Awaiting human agent</p>
          </CardHeader>
          {escalations.length === 0 ? (
            <CardBody><p className="text-sm text-slate-400 text-center py-6">No escalations — all good!</p></CardBody>
          ) : (
            <ul className="divide-y divide-slate-100">
              {escalations.map((l) => (
                <li key={l.userId} className="px-5 py-3 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full ${avatarColor(l.name || l.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {initials(l.name || l.userId)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{l.name || fmtPhone(l.userId)}</p>
                    <p className="text-xs text-slate-400 truncate">{fmtRelative(l.lastActivity)}</p>
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
