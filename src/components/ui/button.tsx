"use client";
import { cn } from "@/src/lib/utils";

export function Button({ className, variant = "primary", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "outline" }) {
  const v =
    variant === "primary"
      ? "bg-brand-500 text-white hover:bg-brand-600 shadow-pop disabled:opacity-60"
      : variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700"
      : variant === "outline"
      ? "border border-slate-200 bg-white hover:border-brand-500 hover:text-brand-600"
      : "hover:bg-slate-100 text-slate-700";
  return <button {...p} className={cn("inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition active:scale-[.98] disabled:cursor-not-allowed sm:min-h-0", v, className)} />;
}
