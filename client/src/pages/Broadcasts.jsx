import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Plus, Trash2, Send, Clock, CheckCircle, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtDateTime } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CardBody, Modal, Input, Textarea, PageLoader, Empty, ErrorBanner } from "@/components/ui";

export default function Broadcasts() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", message: "" });
  const [formError, setFormError] = useState("");
  const qc = useQueryClient();

  const { data: draftsData, isLoading: dLoading } = useQuery({ queryKey: ["broadcastDrafts"], queryFn: api.broadcastDrafts });
  const { data: resultsData, isLoading: rLoading } = useQuery({ queryKey: ["broadcastResults"], queryFn: api.broadcastResults });

  const createMutation = useMutation({
    mutationFn: (data) => api.createDraft(data),
    onSuccess: () => { qc.invalidateQueries(["broadcastDrafts"]); setShowForm(false); setForm({ name: "", message: "" }); },
    onError: (err) => setFormError(err.message),
  });

  const deleteDraftMutation = useMutation({
    mutationFn: api.deleteDraft,
    onSuccess: () => qc.invalidateQueries(["broadcastDrafts"]),
  });

  const drafts = draftsData?.drafts || [];
  const results = resultsData?.results || [];

  if (dLoading || rLoading) return <PageLoader />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Broadcasts</h2>
          <p className="text-sm text-slate-400">Send bulk messages to your leads</p>
        </div>
        <Button icon={Plus} onClick={() => setShowForm(true)}>New Draft</Button>
      </div>

      {/* Draft form modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Broadcast Draft" width="max-w-lg">
        <div className="p-6 space-y-4">
          <ErrorBanner message={formError} />
          <Input label="Campaign Name *" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. June Promo — Arlo Cantonments" />
          <Textarea label="Message *" value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Hello {name}! We have an exciting offer for you at Devtraco Plus…"
            rows={5} />
          <p className="text-xs text-slate-400">Use <code className="bg-slate-100 px-1 rounded">{"{name}"}</code> to personalise with the lead's name.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button size="sm" loading={createMutation.isPending} onClick={() => createMutation.mutate(form)}>Save Draft</Button>
          </div>
        </div>
      </Modal>

      {/* Drafts */}
      <Card>
        <CardHeader action={<Badge variant="default">{drafts.length}</Badge>}>
          <p className="font-semibold text-slate-900">Drafts</p>
          <p className="text-xs text-slate-400">Ready to send campaigns</p>
        </CardHeader>
        {drafts.length === 0 ? (
          <CardBody>
            <Empty icon={Megaphone} title="No drafts" description="Create a draft to start your broadcast campaign."
              action={<Button icon={Plus} size="sm" onClick={() => setShowForm(true)}>New Draft</Button>} />
          </CardBody>
        ) : (
          <ul className="divide-y divide-slate-100">
            {drafts.map((d) => (
              <li key={d.id || d._id} className="px-5 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{d.name}</p>
                  <p className="text-sm text-slate-500 truncate mt-0.5">{d.message?.slice(0, 100)}…</p>
                  <p className="text-xs text-slate-400 mt-1">{fmtRelative(d.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => { if (confirm(`Delete draft "${d.name}"?`)) deleteDraftMutation.mutate(d.id || d._id); }}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <p className="font-semibold text-slate-900">Broadcast History</p>
          <p className="text-xs text-slate-400">Past campaigns and results</p>
        </CardHeader>
        {results.length === 0 ? (
          <CardBody><Empty icon={Send} title="No broadcasts sent yet" /></CardBody>
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
                {results.map((r) => (
                  <tr key={r.id || r._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{r.name || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{r.totalSent ?? "—"}</td>
                    <td className="px-4 py-3"><span className="text-emerald-600 font-medium">{r.delivered ?? "—"}</span></td>
                    <td className="px-4 py-3"><span className="text-red-500 font-medium">{r.failed ?? "—"}</span></td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmtDateTime(r.createdAt)}</td>
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
