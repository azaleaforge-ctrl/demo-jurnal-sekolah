import { cn } from "@/src/lib/utils";
export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cn("rounded-2xl border border-slate-100 bg-white p-5 shadow-soft", className)} />;
}
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="font-display mt-1 text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
