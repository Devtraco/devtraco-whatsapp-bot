import { cn } from "@/lib/utils";
import { Loader2, AlertCircle } from "lucide-react";

/* ─── Badge ─────────────────────────────────────────── */
const badgeVariants = {
  default: "bg-slate-100 text-slate-700",
  green:   "bg-emerald-100 text-emerald-700",
  red:     "bg-red-100 text-red-700",
  amber:   "bg-amber-100 text-amber-700",
  blue:    "bg-blue-100 text-blue-700",
  purple:  "bg-purple-100 text-purple-700",
  teal:    "bg-brand-100 text-brand-700",
  slate:   "bg-slate-100 text-slate-600",
  outline: "border border-slate-300 text-slate-600 bg-transparent",
};

export function Badge({ children, variant = "default", className, dot }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium", badgeVariants[variant] || badgeVariants.default, className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ─── Button ─────────────────────────────────────────── */
const btnVariants = {
  primary:   "bg-brand-600 hover:bg-brand-700 text-white shadow-sm",
  secondary: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm",
  ghost:     "text-slate-600 hover:bg-slate-100 hover:text-slate-800",
  danger:    "bg-red-600 hover:bg-red-700 text-white shadow-sm",
  "ghost-danger": "text-red-500 hover:bg-red-50 hover:text-red-600",
};
const btnSizes = {
  sm: "px-3 py-1.5 text-xs gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-5 py-2.5 text-sm gap-2",
};

export function Button({ children, variant = "primary", size = "md", className, loading, icon: Icon, ...props }) {
  return (
    <button
      disabled={loading || props.disabled}
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed",
        btnVariants[variant],
        btnSizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  );
}

/* ─── Card ─────────────────────────────────────────── */
export function Card({ children, className, ...props }) {
  return (
    <div className={cn("bg-white rounded-xl border border-slate-200 shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className, action }) {
  return (
    <div className={cn("flex items-center justify-between px-5 py-4 border-b border-slate-100", className)}>
      <div className="min-w-0">{children}</div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </div>
  );
}

export function CardBody({ children, className }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

/* ─── Spinner ─────────────────────────────────────────── */
export function Spinner({ size = 20, className }) {
  return <Loader2 size={size} className={cn("animate-spin text-brand-600", className)} />;
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full py-20">
      <Spinner size={32} />
    </div>
  );
}

/* ─── Empty ─────────────────────────────────────────── */
export function Empty({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4">
          <Icon size={22} className="text-slate-400" />
        </div>
      )}
      <p className="font-semibold text-slate-700 mb-1">{title}</p>
      {description && <p className="text-sm text-slate-400 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ─── StatCard ─────────────────────────────────────────── */
export function StatCard({ label, value, sub, icon: Icon, trend, color = "brand", className }) {
  const iconColors = {
    brand:  "bg-brand-50 text-brand-600",
    red:    "bg-red-50 text-red-600",
    amber:  "bg-amber-50 text-amber-600",
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-emerald-50 text-emerald-600",
    purple: "bg-purple-50 text-purple-600",
  };
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">{value ?? "—"}</p>
          {sub && <p className="text-xs text-slate-400 mt-1 truncate">{sub}</p>}
          {trend != null && (
            <p className={cn("text-xs font-medium mt-1.5", trend >= 0 ? "text-emerald-600" : "text-red-500")}>
              {trend >= 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last 7d
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconColors[color] || iconColors.brand)}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Modal ─────────────────────────────────────────── */
export function Modal({ open, onClose, title, children, width = "max-w-lg" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh]", width)}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none">&times;</button>
          </div>
        )}
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

/* ─── Input / Select / Textarea ─────────────────────── */
export function Input({ label, error, className, ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-xs font-medium text-slate-600">{label}</label>}
      <input
        className={cn(
          "w-full px-3 py-2 rounded-lg border text-sm bg-white text-slate-900 outline-none transition-all",
          "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          error && "border-red-400 focus:border-red-500 focus:ring-red-500/20",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Select({ label, error, className, children, ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-xs font-medium text-slate-600">{label}</label>}
      <select
        className={cn(
          "w-full px-3 py-2 rounded-lg border text-sm bg-white text-slate-900 outline-none transition-all",
          "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className, ...props }) {
  return (
    <div className="space-y-1">
      {label && <label className="block text-xs font-medium text-slate-600">{label}</label>}
      <textarea
        className={cn(
          "w-full px-3 py-2 rounded-lg border text-sm bg-white text-slate-900 outline-none transition-all resize-none",
          "border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/* ─── ErrorBanner ─────────────────────────────────────── */
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
      <AlertCircle size={16} className="shrink-0" />
      {message}
    </div>
  );
}

/* ─── ScoreBar ─────────────────────────────────────────── */
export function ScoreBar({ score }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-blue-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500 w-7 text-right">{pct}</span>
    </div>
  );
}
