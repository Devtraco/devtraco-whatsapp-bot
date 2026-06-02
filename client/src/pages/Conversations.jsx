import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, MessageSquare, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtPhone, truncate, avatarColor, initials } from "@/lib/utils";
import { Badge, Card, PageLoader, Empty } from "@/components/ui";

function stateBadgeVariant(state) {
  if (!state) return "slate";
  if (state.includes("ESCALATED")) return "red";
  if (state === "ACTIVE") return "green";
  if (state === "AWAITING_PRODUCT_INTENT") return "blue";
  return "slate";
}

function stateLabel(s) {
  return s?.replace(/_/g, " ") || "—";
}

export default function Conversations() {
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.conversations,
    refetchInterval: 30_000,
  });

  const { data: convo, isLoading: convoLoading } = useQuery({
    queryKey: ["conversation", selected?.userId],
    queryFn: () => api.conversation(selected.userId),
    enabled: !!selected,
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteConversation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setSelected(null);
    },
  });

  const list = (data?.conversations || [])
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return String(c.userId).includes(q) || c.name?.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q);
    })
    .sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));

  if (isLoading) return <PageLoader />;

  return (
    <div className="max-w-[1400px]">
      <div className="flex gap-5" style={{ height: "calc(100vh - 144px)" }}>

        {/* Left — list */}
        <Card className="w-80 shrink-0 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="px-4 py-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-7 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">{list.length} conversations</p>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {list.length === 0 ? (
              <Empty icon={MessageSquare} title="No conversations" description="WhatsApp conversations will appear here." />
            ) : list.map((c) => (
              <button
                key={c.userId}
                onClick={() => setSelected(c)}
                className={`w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors flex items-start gap-3 ${selected?.userId === c.userId ? "bg-brand-50 border-l-2 border-brand-500" : ""}`}
              >
                <div className={`w-10 h-10 rounded-full ${avatarColor(c.name || c.userId)} flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5`}>
                  {initials(c.name || c.userId)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-sm text-slate-800 truncate flex-1 pr-2">{c.name || fmtPhone(c.userId)}</p>
                    <span className="text-[10px] text-slate-400 shrink-0">{fmtRelative(c.lastActivity)}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{c.lastMessage || "No messages"}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant={stateBadgeVariant(c.state)} className="text-[10px] px-1.5 py-0">
                      {stateLabel(c.state)}
                    </Badge>
                    <span className="text-[10px] text-slate-400">{c.messageCount} msgs</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Right — chat */}
        <Card className="flex-1 flex flex-col overflow-hidden min-w-0">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center">
              <Empty icon={MessageSquare} title="Select a conversation"
                description="Click any conversation on the left to view the full chat history." />
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
                <div className={`w-10 h-10 rounded-full ${avatarColor(selected.name || selected.userId)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                  {initials(selected.name || selected.userId)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{selected.name || fmtPhone(selected.userId)}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>{fmtPhone(selected.userId)}</span>
                    <span>·</span>
                    <span>{selected.messageCount} messages</span>
                    {selected.leadScore > 0 && <><span>·</span><span>Score {selected.leadScore}</span></>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={stateBadgeVariant(selected.state)}>{stateLabel(selected.state)}</Badge>
                  <button
                    onClick={() => { if (confirm("Delete this conversation? This cannot be undone.")) deleteMutation.mutate(selected.userId); }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete conversation"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* Context bar */}
              {(selected.propertyInterest || selected.email || selected.budget) && (
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500 shrink-0">
                  {selected.propertyInterest && <span>🏠 <strong className="text-slate-700">{selected.propertyInterest}</strong></span>}
                  {selected.budget          && <span>💰 Budget: <strong className="text-slate-700">{selected.budget}</strong></span>}
                  {selected.email           && <span>📧 <strong className="text-slate-700">{selected.email}</strong></span>}
                  {selected.consentGiven    && <span className="text-emerald-600">✓ GDPR consent given</span>}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-2.5 bg-slate-50/60">
                {convoLoading ? (
                  <p className="text-center text-slate-400 text-sm py-10">Loading messages…</p>
                ) : !convo?.history?.length ? (
                  <p className="text-center text-slate-400 text-sm py-10">No messages in this conversation yet</p>
                ) : convo.history.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-brand-600 text-white rounded-br-sm"
                        : "bg-white text-slate-800 border border-slate-200 rounded-bl-sm shadow-card"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
