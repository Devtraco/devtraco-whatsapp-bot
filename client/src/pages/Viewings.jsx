import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Check, X, Trash2, Clock, Building2, User } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtRelative, fmtPhone } from "@/lib/utils";
import { Badge, Button, Card, CardHeader, CardBody, PageLoader, Empty, StatCard } from "@/components/ui";

const STATUS_FILTERS = ["all", "pending", "confirmed", "cancelled"];
const STATUS_COLORS  = { pending: "amber", confirmed: "green", cancelled: "red" };

export default function Viewings() {
  const [filter, setFilter] = useState("all");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ["viewings"], queryFn: api.viewings, refetchInterval: 30_000 });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.updateViewingStatus(id, status),
    onSuccess: () => qc.invalidateQueries(["viewings"]),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteViewing,
    onSuccess: () => qc.invalidateQueries(["viewings"]),
  });

  const viewings = data?.viewings || [];
  const filtered = filter === "all" ? viewings : viewings.filter((v) => v.status === filter);
  const pending   = viewings.filter((v) => v.status === "pending").length;
  const confirmed = viewings.filter((v) => v.status === "confirmed").length;
  const cancelled = viewings.filter((v) => v.status === "cancelled").length;

  if (isLoading) return <PageLoader />;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Pending" value={pending} icon={Clock} color="amber" sub="Awaiting confirmation" />
        <StatCard label="Confirmed" value={confirmed} icon={Check} color="green" sub="Scheduled viewings" />
        <StatCard label="Cancelled" value={cancelled} icon={X} color="red" sub="Declined or cancelled" />
      </div>

      <Card>
        <CardHeader>
          <p className="font-semibold text-slate-900">All Viewings</p>
          <p className="text-xs text-slate-400">{filtered.length} of {viewings.length}</p>
        </CardHeader>

        {/* Filter tabs */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex gap-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                filter === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s === "all" ? `All (${viewings.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${viewings.filter((v) => v.status === s).length})`}
            </button>
          ))}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <CardBody><Empty icon={Calendar} title="No viewings" description="Property viewings will appear here." /></CardBody>
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
                {filtered.map((v) => (
                  <tr key={v.id || v._id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center">
                          <User size={13} className="text-brand-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{v.name || "Unknown"}</p>
                          <p className="text-xs text-slate-400">{fmtPhone(v.userId)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Building2 size={13} className="text-slate-400 shrink-0" />
                        <span className="truncate max-w-[160px]">{v.propertyName || "—"}</span>
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
                        {v.status?.charAt(0).toUpperCase() + v.status?.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{fmtRelative(v.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {v.status === "pending" && (
                          <>
                            <button
                              onClick={() => statusMutation.mutate({ id: v.id || v._id, status: "confirmed" })}
                              className="px-2.5 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 flex items-center gap-1 transition-colors"
                            ><Check size={11} /> Confirm</button>
                            <button
                              onClick={() => statusMutation.mutate({ id: v.id || v._id, status: "cancelled" })}
                              className="px-2.5 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 flex items-center gap-1 transition-colors"
                            ><X size={11} /> Cancel</button>
                          </>
                        )}
                        {v.status === "confirmed" && (
                          <button
                            onClick={() => statusMutation.mutate({ id: v.id || v._id, status: "cancelled" })}
                            className="px-2.5 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 flex items-center gap-1 transition-colors"
                          ><X size={11} /> Cancel</button>
                        )}
                        <button
                          onClick={() => { if (confirm("Delete this viewing?")) deleteMutation.mutate(v.id || v._id); }}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        ><Trash2 size={13} /></button>
                      </div>
                    </td>
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
