"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/src/lib/auth";

export default function Home() {
  const { user, ready } = useAuth();
  const r = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (!user) r.replace("/login");
    else r.replace(user.role === "admin" ? "/admin" : user.role === "guru" ? "/guru" : "/kepsek");
  }, [user, ready, r]);
  return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Membuka Jurnal Sekolah…</div>;
}
