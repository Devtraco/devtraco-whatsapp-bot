import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2, Send, CheckCircle, XCircle, Users } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CardBody, Modal, Input, Textarea, PageLoader, Empty, ErrorBanner } from "@/components/ui";

const TIERS = [
  { key: "all",  label: "All leads" },
  { key: "hot",  label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "cold", label: "Cold" },
];

function SendToLeadsModal({ initial, onClose }) {
  const qc = useQueryClient();
  const [title,   setTitle]   = useState(initial?.title || "");
  const [message, setMessage] = useState(initial?.message || "");
  const [tier,    setTier]    = useState("all");
  const [error,   setError]   = useState("");
  const [result,  setResult]  = useState(null);

  const { data: audience, isLoading: audLoading } = useQuery({
    queryKey: ["leadsAudience", tier],
    queryFn: () => api.broadcastLeadsAudience(tier === "all" ? "" : tier),
  });
  const count = audience?.count ?? 0;

  const sendMutation = useMutation({
    mutationFn: () => api.sendToLeads({ title, message, tier: tier === "all" ? undefined : tier }),
    onSuccess: (data) => {
      setResult(data);
      qc.invalidateQueries({ queryKey: ["broadcastResults"] });
    },
    onError: (e) => setError(e.message),
  });

  function submit() {
    setError("");
    if (!message.trim()) { setError("Message is required."); return; }
    if (count === 0)      { setError("No leads match this audience."); return; }
    if (!confirm(`Send this message to ${count} lead${count !== 1 ? "s" : ""} on WhatsApp now?`)) return;
    sendMutation.mutate();
  }

  return (
    <Modal open onClose={onClose} title="Send to Leads" width="max-w-lg">
      <div className="p-6 space-y-4">
        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <CheckCircle size={22} />
              <p className="font-semibold">Broadcast sent</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-lg font-bold text-slate-800 tabular-nums">{result.audience ?? result.totalRequested ?? 0}</p>
                <p className="text-xs text-slate-400">Audience</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-lg font-bold text-emerald-600 tabular-nums">{result.totalSent ?? 0}</p>
                <p className="text-xs text-slate-400">Sent</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-lg font-bold text-red-500 tabular-nums">{result.failed ?? 0}</p>
                <p className="text-xs text-slate-400">Failed</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <ErrorBanner message={error} />

            {/* Audience */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Audience</label>
              <div className="flex gap-1.5 flex-wrap">
                {TIERS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTier(t.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      tier === t.key ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                <Users size={14} />
                {audLoading ? "Counting recipients…" : <span><strong className="text-slate-800">{count}</strong> lead{count !== 1 ? "s" : ""} will receive this message</span>}
              </p>
            </div>

            <Input
              label="Campaign Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New Launch — Lotus"
            />
            <Textarea
              label="Message *"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Hello {name}! We have an exciting update at Devtraco Plus…"
              rows={6}
            />
            <p className="text-xs text-slate-400">
              Use <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{"{name}"}</code> to personalise with each lead's name.
            </p>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" icon={Send} loading={sendMutation.isPending} onClick={submit} disabled={count === 0}>
                Send to {count} lead{count !== 1 ? "s" : ""}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function Broadcasts() {
  const [showForm, setShowForm] = useState(false);
  // Draft uses { title, message } — NOT { name, message }
  const [form, setForm] = useState({ title: "", message: "" });
  const [formError, setFormError] = useState("");
  const [sendCompose, setSendCompose] = useState(null); // null | { title, message }
  const qc = useQueryClient();

  const { data: draftsData, isLoading: dLoading } = useQuery({ queryKey: ["broadcastDrafts"],  queryFn: api.broadcastDrafts });
  const { data: resultsData, isLoading: rLoading } = useQuery({ queryKey: ["broadcastResults"], queryFn: api.broadcastResults });

  const createMutation = useMutation({
    mutationFn: (data) => api.createDraft(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["broadcastDrafts"] });
      setShowForm(false);
      setForm({ title: "", message: "" });
      setFormError("");
    },
    onError: (err) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteDraft,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["broadcastDrafts"] }),
  });

  const drafts  = draftsData?.drafts   || [];
  const results = resultsData?.results || [];

  if (dLoading || rLoading) return <PageLoader />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Broadcasts</h2>
          <p className="text-sm text-slate-400">Send bulk WhatsApp messages to your leads</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={Send} onClick={() => setSendCompose({ title: "", message: "" })}>Send to Leads</Button>
          <Button icon={Plus} onClick={() => { setShowForm(true); setFormError(""); }}>New Draft</Button>
        </div>
      </div>

      {/* Send-to-leads modal */}
      {sendCompose && (
        <SendToLeadsModal initial={sendCompose} onClose={() => setSendCompose(null)} />
      )}

      {/* Draft form modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Broadcast Draft" width="max-w-lg">
        <div className="p-6 space-y-4">
          <ErrorBanner message={formError} />
          <Input
            label="Campaign Title *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. June Promo — Arlo Cantonments"
          />
          <Textarea
            label="Message *"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Hello {name}! We have an exciting update at Devtraco Plus…"
            rows={5}
          />
          <p className="text-xs text-slate-400">
            Use <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">{"{name}"}</code> to personalise with the lead's first name.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={createMutation.isPending}
              onClick={() => {
                if (!form.title || !form.message) { setFormError("Title and message are required."); return; }
                createMutation.mutate(form);
              }}
            >
              Save Draft
            </Button>
          </div>
        </div>
      </Modal>

      {/* Drafts */}
      <Card>
        <CardHeader action={<Badge variant="default">{drafts.length} drafts</Badge>}>
          <p className="font-semibold text-slate-900">Saved Drafts</p>
          <p className="text-xs text-slate-400">Campaigns ready to send</p>
        </CardHeader>
        {drafts.length === 0 ? (
          <CardBody>
            <Empty icon={Megaphone} title="No drafts yet"
              description="Create a draft to compose your broadcast message before sending."
              action={<Button icon={Plus} size="sm" onClick={() => setShowForm(true)}>New Draft</Button>} />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {drafts.map((d) => {
              const id = d.draftId || d._id || d.id;
              return (
                <li key={id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{d.title || d.name || "Untitled draft"}</p>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{d.message}</p>
                    <p className="text-xs text-slate-400 mt-1.5">{fmtRelative(d.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Send}
                      onClick={() => setSendCompose({ title: d.title || "", message: d.message || "" })}
                    >
                      Send
                    </Button>
                    <button
                      onClick={() => { if (confirm(`Delete "${d.title || "this draft"}"?`)) deleteMutation.mutate(id); }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <p className="font-semibold text-slate-900">Broadcast History</p>
          <p className="text-xs text-slate-400">Past campaigns and delivery results</p>
        </CardHeader>
        {results.length === 0 ? (
          <CardBody>
            <Empty icon={Send} title="No broadcasts sent yet"
              description="Once you send a broadcast campaign, the results will appear here." />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Campaign", "Sent", "Delivered", "Failed", "Date"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r, i) => (
                  <tr key={r.broadcastId || r._id || i} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.title || r.name || "—"}</td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{r.totalSent ?? r.sent ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-emerald-600 font-semibold tabular-nums flex items-center gap-1">
                        <CheckCircle size={12} />{r.totalSent ?? r.delivered ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-red-500 font-semibold tabular-nums flex items-center gap-1">
                        <XCircle size={12} />{r.totalFailed ?? r.failed ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmtDateTime(r.createdAt || r.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
