import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardHeader, CardBody, Badge, PageLoader, StatCard } from "@/components/ui";
import { Server, Database, Bot, Clock, Zap } from "lucide-react";

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold text-slate-800 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

export default function Settings() {
  const { data: health, isLoading } = useQuery({ queryKey: ["health"], queryFn: api.health });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: api.stats });

  if (isLoading) return <PageLoader />;

  const uptimeMins = health?.uptime ? Math.floor(health.uptime / 60) : 0;
  const uptimeHrs  = Math.floor(uptimeMins / 60);
  const uptimeStr  = uptimeHrs > 0 ? `${uptimeHrs}h ${uptimeMins % 60}m` : `${uptimeMins}m`;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">System Overview</h2>
        <p className="text-sm text-slate-400">Bot status and configuration</p>
      </div>

      {/* Health stats */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Server Uptime" value={uptimeStr} icon={Clock} color="green" sub="Since last restart" />
        <StatCard label="Active Sessions" value={health?.activeSessions ?? 0} icon={Zap} color="brand" sub="Live conversations" />
      </div>

      {/* System info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900">System Status</p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <div className="px-5">
            <Row label="Status" value={
              <Badge variant="green" dot>Operational</Badge>
            } />
            <Row label="Last health check" value={health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : "—"} />
            <Row label="Total messages processed" value={(stats?.totalMessages || 0).toLocaleString()} />
            <Row label="Total properties" value={stats?.properties || 0} />
            <Row label="Total leads" value={stats?.leads?.total || 0} />
            <Row label="Pending viewings" value={stats?.pendingViewings || 0} />
          </div>
        </CardBody>
      </Card>

      {/* WhatsApp / API config note */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900">Configuration</p>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-500 mb-3">
            Bot configuration (API keys, phone numbers, escalation contacts) is managed via environment variables on the server. Contact your system administrator to update these values.
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "OPENAI_API_KEY",
              "MONGODB_URI", "ADMIN_USERNAME", "JWT_SECRET",
            ].map((k) => (
              <div key={k} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="font-mono text-slate-600 truncate">{k}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader>
          <p className="font-semibold text-red-600">Danger Zone</p>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-500 mb-4">These actions are irreversible. Use with caution.</p>
          <button
            onClick={async () => {
              if (confirm("⚠️ This will delete ALL conversation history. This cannot be undone. Are you sure?")) {
                await api.deleteAllConversations();
                alert("All conversations cleared.");
              }
            }}
            className="px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
          >
            Clear all conversations
          </button>
        </CardBody>
      </Card>
    </div>
  );
}
