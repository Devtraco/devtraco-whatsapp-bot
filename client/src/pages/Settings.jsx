import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardHeader, CardBody, Badge, PageLoader, StatCard } from "@/components/ui";
import { Server, Bot, Clock, Zap, Database, Shield, RefreshCw, Tags, AlertTriangle } from "lucide-react";
import { fmtDateTime } from "@/lib/utils";

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold text-slate-800 text-right max-w-[60%] truncate ${mono ? "font-mono text-xs" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { data: health, isLoading } = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 60_000 });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: api.stats });

  const clearMutation = useMutation({
    mutationFn: api.deleteAllConversations,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["conversations"] }),
  });

  const { data: priceSync } = useQuery({
    queryKey: ["price-sync-status"],
    queryFn: api.priceSyncStatus,
    refetchInterval: 60_000,
  });

  const priceSyncMutation = useMutation({
    mutationFn: api.runPriceSync,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-sync-status", "properties"] }),
    onError: (e) => alert("Price sync failed: " + e.message),
  });

  if (isLoading) return <PageLoader />;

  const lastSync = priceSync?.result;

  const uptimeSec = health?.uptime || 0;
  const hrs  = Math.floor(uptimeSec / 3600);
  const mins = Math.floor((uptimeSec % 3600) / 60);
  const uptimeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">System Settings</h2>
        <p className="text-sm text-slate-400">Bot status, health, and configuration</p>
      </div>

      {/* Health KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Server Uptime"    value={uptimeStr}                     icon={Clock}  color="green" sub="Since last restart" />
        <StatCard label="Active Sessions"  value={health?.activeSessions ?? 0}   icon={Zap}    color="brand" sub="Live conversations now" />
      </div>

      {/* System status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900 text-sm">System Status</p>
          </div>
          <button onClick={() => qc.invalidateQueries({ queryKey: ["health", "stats"] })}
            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </CardHeader>
        <CardBody className="p-0 px-5">
          <InfoRow label="Status"                  value={<Badge variant="green" dot>Operational</Badge>} />
          <InfoRow label="Last health check"        value={fmtDateTime(health?.timestamp)} />
          <InfoRow label="Total leads"              value={(stats?.leads?.total || 0).toLocaleString()} />
          <InfoRow label="Total messages processed" value={(stats?.totalMessages || 0).toLocaleString()} />
          <InfoRow label="Active properties"        value={stats?.properties || 0} />
          <InfoRow label="Pending viewings"         value={stats?.pendingViewings || 0} />
          <InfoRow label="Open escalations"         value={stats?.awaitingAgent || 0} />
        </CardBody>
      </Card>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900 text-sm">Bot Configuration</p>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">
            All bot settings (API keys, phone numbers, AI model, escalation contacts, CRM) are managed via environment variables on the server. Update them in your Render service environment settings.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID",
              "OPENAI_API_KEY", "MONGODB_URI",
              "ADMIN_USERNAME", "JWT_SECRET",
              "SMTP_HOST", "BASE_URL",
            ].map((k) => (
              <div key={k} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                <span className="font-mono text-xs text-slate-600 truncate">{k}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Price list sync */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tags size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900 text-sm">Price List Sync</p>
          </div>
          <button
            onClick={() => priceSyncMutation.mutate()}
            disabled={priceSyncMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={priceSyncMutation.isPending ? "animate-spin" : ""} />
            {priceSyncMutation.isPending ? "Syncing…" : "Sync now"}
          </button>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-500 mb-4 leading-relaxed">
            Property prices sync automatically from the{" "}
            <a
              href={`https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_PRICE_SHEET_ID || "1Hyd3Gv_8yY5RYlJIH9yJYMr0wTfnwl1dl7_oWMMXtFk"}/edit`}
              target="_blank" rel="noopener noreferrer" className="text-brand-600 underline"
            >
              Devtraco price list Google Sheet
            </a>{" "}
            every 30 minutes — edits there flow into the database and the bot's answers without a deploy. Use "Sync now" to pull the latest immediately after updating the sheet.
          </p>

          {!lastSync ? (
            <p className="text-xs text-slate-400">No sync has run yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {lastSync.ok
                  ? <Badge variant="green" dot>Last sync OK</Badge>
                  : <Badge variant="red" dot>Last sync failed</Badge>}
                <span>{fmtDateTime(lastSync.timestamp)}</span>
              </div>

              {lastSync.error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{lastSync.error}</p>
              )}

              {lastSync.matchedProperties?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-600 mb-1.5">Updated from sheet ({lastSync.matchedProperties.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {lastSync.matchedProperties.map((m) => (
                      <span key={m.propertyId} className="text-[11px] px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-100">
                        {m.name} · {m.unitCount} unit{m.unitCount !== 1 ? "s" : ""} · from ${m.priceFrom?.toLocaleString()}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {lastSync.unmatchedItems?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-amber-700 mb-1.5 flex items-center gap-1">
                    <AlertTriangle size={12} /> Couldn't be matched to a property ({lastSync.unmatchedItems.length})
                  </p>
                  <div className="space-y-1">
                    {lastSync.unmatchedItems.map((u, i) => (
                      <div key={i} className="text-[11px] px-2.5 py-1.5 bg-amber-50 text-amber-800 rounded-md border border-amber-100">
                        <span className="font-semibold">{u.sheetProject}</span>
                        {" — "}
                        {u.unitCount != null ? `${u.unitCount} unit row(s), ` : ""}
                        {u.reason}
                        {u.unmatchedUnits ? `: ${u.unmatchedUnits.join(", ")}` : ""}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5">
                    These are in the sheet but not in the property catalog — add them as properties (Properties page) with a matching name, or rename the row in the sheet, then sync again.
                  </p>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-brand-600" />
            <p className="font-semibold text-slate-900 text-sm">Security</p>
          </div>
        </CardHeader>
        <CardBody className="p-0 px-5">
          <InfoRow label="Authentication"  value="HMAC-SHA256 JWT · 24h expiry" />
          <InfoRow label="Rate limiting"   value="Active on webhook endpoint" />
          <InfoRow label="GDPR consent"    value="Collected before lead capture" />
        </CardBody>
      </Card>

      {/* Danger zone */}
      <Card className="border-red-200">
        <CardHeader>
          <p className="font-semibold text-red-600">Danger Zone</p>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-500 mb-4">
            These actions are permanent and cannot be undone. Use with extreme caution.
          </p>
          <button
            onClick={async () => {
              if (!confirm("⚠️ This will permanently delete ALL conversation history and lead data. This cannot be undone.\n\nAre you absolutely sure?")) return;
              try {
                await clearMutation.mutateAsync();
                alert("All conversations have been cleared.");
              } catch (e) {
                alert("Failed: " + e.message);
              }
            }}
            disabled={clearMutation.isPending}
            className="px-4 py-2.5 text-sm font-medium text-red-600 border border-red-300 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {clearMutation.isPending ? "Clearing…" : "Clear all conversations & lead data"}
          </button>
        </CardBody>
      </Card>
    </div>
  );
}
