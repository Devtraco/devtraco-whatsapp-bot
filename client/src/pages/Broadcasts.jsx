import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2, Send, CheckCircle, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CardBody, Modal, Input, Textarea, PageLoader, Empty, ErrorBanner } from "@/components/ui";

export default function Broadcasts() {
  const [showForm, setShowForm] = useState(false);
  // Draft uses { title, message } — NOT { name, message }
  const [form, setForm] = useState({ title: "", message: "" });
  const [formError, setFormError] = useState("");
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
        <Button icon={Plus} onClick={() => { setShowForm(true); setFormError(""); }}>New Draft</Button>
      </div>

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
                  <div className="flex items-center gap-2 shrink-0 mt-1">
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
                        <CheckCircle size={12} />{r.delivered ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-red-500 font-semibold tabular-nums flex items-center gap-1">
                        <XCircle size={12} />{r.failed ?? "—"}
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
