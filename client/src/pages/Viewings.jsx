import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Check, X, Trash2, Clock, Building2, User, Bell } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtPhone } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CardBody, PageLoader, Empty, StatCard } from "@/components/ui";

// API uses uppercase: PENDING | CONFIRMED | CANCELLED | COMPLETED
const STATUS_COLORS  = { PENDING: "amber", CONFIRMED: "green", CANCELLED: "red", COMPLETED: "blue" };
const STATUS_LABEL   = { PENDING: "Pending", CONFIRMED: "Confirmed", CANCELLED: "Cancelled", COMPLETED: "Completed" };
const FILTERS        = ["ALL", "PENDING", "CONFIRMED", "CANCELLED"];

export default function Viewings() {
  const [filter, setFilter] = useState("ALL");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["viewings"], queryFn: api.viewings, refetchInterval: 30_000 });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.updateViewingStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["viewings"] }),
  });

  const notifyMutation = useMutation({
    mutationFn: (id) => api.notifyAgent(id),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteViewing,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["viewings"] }),
  });

  const viewings = data?.viewings || [];
  const filtered = filter === "ALL" ? viewings : viewings.filter((v) => v.status === filter);

  const pendingCount   = viewings.filter((v) => v.status === "PENDING").length;
  const confirmedCount = viewings.filter((v) => v.status === "CONFIRMED").length;
  const cancelledCount = viewings.filter((v) => v.status === "CANCELLED").length;

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Pending"   value={pendingCount}   icon={Clock}     color="amber" sub="Awaiting confirmation" />
        <StatCard label="Confirmed" value={confirmedCount} icon={Check}     color="green" sub="Scheduled & confirmed" />
        <StatCard label="Cancelled" value={cancelledCount} icon={X}         color="red"   sub="Declined or withdrawn" />
      </div>

      <Card>
        <CardHeader>
          <p className="font-semibold text-slate-900">Viewing Schedule</p>
          <p className="text-xs text-slate-400">{filtered.length} of {viewings.length}</p>
        </CardHeader>

        {/* Filter tabs */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => {
            const count = f === "ALL" ? viewings.length : viewings.filter((v) => v.status === f).length;
            return (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                  filter === f ? "bg-navy-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {f === "ALL" ? "All" : STATUS_LABEL[f]} ({count})
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <CardBody>
            <Empty icon={Calendar} title="No viewings" description="Property viewings will appear here once scheduled through WhatsApp." />
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  {["Contact", "Property", "Date & Time", "Status", "Booked", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((v, idx) => {
                  const id = v.viewingId || v._id || idx;
                  return (
                    <tr key={id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                            <User size={14} className="text-brand-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{v.name || "Unknown"}</p>
                            <p className="text-xs text-slate-400">{fmtPhone(v.phone || v.userId)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 size={13} className="text-slate-400 shrink-0" />
                          <span className="text-slate-700 truncate max-w-[150px]">{v.propertyName || "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-slate-400 shrink-0" />
                          <div>
                            <p className="font-medium text-slate-800">{v.preferredDate || "—"}</p>
                            <p className="text-xs text-slate-400">{v.preferredTime || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_COLORS[v.status] || "default"} dot>
                          {STATUS_LABEL[v.status] || v.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                        {fmtRelative(v.createdAt || v.bookedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {v.status === "PENDING" && (
                            <>
                              <button
                                onClick={() => statusMutation.mutate({ id, status: "CONFIRMED" })}
                                disabled={statusMutation.isPending}
                                className="px-2.5 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 flex items-center gap-1 transition-colors disabled:opacity-50">
                                <Check size={11} /> Confirm
                              </button>
                              <button
                                onClick={() => statusMutation.mutate({ id, status: "CANCELLED" })}
                                disabled={statusMutation.isPending}
                                className="px-2.5 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 flex items-center gap-1 transition-colors disabled:opacity-50">
                                <X size={11} /> Cancel
                              </button>
                            </>
                          )}
                          {v.status === "CONFIRMED" && (
                            <>
                              <button
                                onClick={() => notifyMutation.mutate(id)}
                                disabled={notifyMutation.isPending}
                                title="Notify agent via WhatsApp"
                                className="px-2.5 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 rounded-lg border border-brand-200 flex items-center gap-1 transition-colors disabled:opacity-50">
                                <Bell size={11} /> Notify
                              </button>
                              <button
                                onClick={() => statusMutation.mutate({ id, status: "CANCELLED" })}
                                disabled={statusMutation.isPending}
                                className="px-2.5 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 flex items-center gap-1 transition-colors disabled:opacity-50">
                                <X size={11} /> Cancel
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => { if (confirm("Delete this viewing record?")) deleteMutation.mutate(id); }}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
