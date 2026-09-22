import { cn } from "@/src/lib/utils";
import { Inbox } from "lucide-react";

export function Badge({ tone = "slate", children }: { tone?: "slate" | "green" | "amber" | "red" | "blue"; children: React.ReactNode }) {
  const m = { slate: "bg-slate-100 text-slate-600", green: "bg-emerald-100 text-emerald-700", amber: "bg-amber-100 text-amber-700", red: "bg-rose-100 text-rose-700", blue: "bg-brand-100 text-brand-600" };
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", m[tone])}>{children}</span>;
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-slate-200/70", className)} />;
}
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="grid place-items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-500"><Inbox size={22} /></span>
      <p className="font-display font-bold">{title}</p>
      {hint && <p className="max-w-xs text-sm text-slate-500">{hint}</p>}
    </div>
  );
}
export function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-white/40 border-t-white align-middle" />;
}
