"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { BookOpenCheck, LayoutDashboard, Users, GraduationCap, School, BookOpen, Clock, FileText, KeyRound, Download, Archive, Settings, History, PenLine, BarChart3, LogOut, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { mockSetting } from "@/src/lib/db";
import { Modal } from "@/src/components/ui/modal";
import { cn } from "@/src/lib/utils";
import { useAuth } from "@/src/lib/auth";
import type { Role } from "@/src/lib/mock";

const menus: Record<Role, { href: string; label: string; icon: any }[]> = {
  admin: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/siswa", label: "Siswa", icon: Users },
    { href: "/admin/kelas", label: "Kelas", icon: School },
    { href: "/admin/guru", label: "Guru", icon: GraduationCap },
    { href: "/admin/mapel", label: "Mapel", icon: BookOpen },
    { href: "/admin/jam", label: "Jam", icon: Clock },
    { href: "/admin/materi", label: "Materi", icon: FileText },
    { href: "/admin/akun", label: "Akun", icon: KeyRound },
    { href: "/admin/export", label: "Export", icon: Download },
    { href: "/admin/backup", label: "Backup", icon: Archive },
    { href: "/admin/pengaturan", label: "Pengaturan", icon: Settings },
    { href: "/admin/cara-pakai", label: "Cara Pakai & Sistem", icon: BookOpen },
  ],
  guru: [
    { href: "/guru", label: "Beranda", icon: LayoutDashboard },
    { href: "/guru/jurnal-baru", label: "Jurnal Baru", icon: PenLine },
    { href: "/guru/riwayat", label: "Riwayat", icon: History },
    { href: "/guru/cara-pakai", label: "Cara Pakai & Sistem", icon: BookOpen },
  ],
  kepsek: [
    { href: "/kepsek", label: "Dashboard", icon: LayoutDashboard },
    { href: "/kepsek/guru", label: "Guru", icon: GraduationCap },
    { href: "/kepsek/siswa", label: "Siswa", icon: Users },
    { href: "/kepsek/export", label: "Export", icon: Download },
    { href: "/kepsek/backup", label: "Backup", icon: Archive },
    { href: "/kepsek/cara-pakai", label: "Cara Pakai & Sistem", icon: BookOpen },
  ],
};

// Nama sekolah dinamis dari school_settings/main (realtime semua device);
// fallback mock bila Firestore tak terjangkau.
function useSchoolName(): string {
  const [name, setName] = useState(mockSetting().school_name);
  useEffect(() => {
    if (!db) return;
    try {
      return onSnapshot(
        doc(db, "school_settings", "main"),
        (s) => { const n = (s.data() as any)?.school_name?.trim(); if (n) setName(n); },
        () => {},
      );
    } catch { /* fallback mock */ }
  }, []);
  return name;
}

export function Sidebar({ role }: { role: Role }) {  const path = usePathname();
  const { user, logout } = useAuth();
  const r = useRouter();
  const schoolName = useSchoolName();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-hidden bg-ink text-white lg:flex lg:h-dvh">
      <div className="flex shrink-0 items-center gap-3 px-5 pb-6 pt-7">
        <span className="grid size-11 place-items-center rounded-2xl bg-brand-500 shadow-pop"><BookOpenCheck size={22} /></span>
        <div><p className="font-display text-sm font-bold leading-tight">Jurnal Sekolah</p><p className="text-xs text-white/60">{schoolName}</p></div>
      </div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-1">
        {menus[role].map((m) => (
          <Link key={m.href} href={m.href} className={cn("flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white", (path === m.href || (m.href !== `/${role}` && path.startsWith(m.href))) && "bg-brand-500 text-white shadow-pop")}>
            <m.icon size={18} />{m.label}
          </Link>
        ))}
      </nav>
      <div className="shrink-0 p-4">
        <div className="rounded-2xl bg-white/10 p-3 text-xs">
          <p className="font-bold text-white">{user?.name}</p>
          <p className="text-white/60 capitalize">{user?.role}</p>
          <button onClick={() => { logout(); r.replace("/login"); }} className="mt-2 flex items-center gap-1.5 font-semibold text-accent-400 hover:text-accent-500"><LogOut size={14} /> Keluar</button>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({ title, hint }: { title: string; hint?: string }) {
  const { user, logout } = useAuth();
  const r = useRouter();
  return (
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5 sm:px-6">
        <span className="grid size-9 place-items-center rounded-xl bg-ink text-white lg:hidden"><School size={18} /></span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-base font-bold sm:text-lg">{title}</h1>
          {hint && <p className="truncate text-xs text-slate-500">{hint}</p>}
        </div>
        {user && <span className="hidden rounded-full bg-white px-3 py-1.5 text-xs font-semibold shadow-soft sm:block">{user.name}</span>}
        {user && (
          <button
            onClick={() => { logout(); toast.success("Berhasil keluar."); r.replace("/login"); }}
            title="Keluar" aria-label="Keluar"
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-white text-slate-500 shadow-soft transition hover:text-rose-600 lg:hidden"
          >
            <LogOut size={17} />
          </button>
        )}
      </div>
    </header>
  );
}

export function BottomBar({ role }: { role: Role }) {
  const path = usePathname();
  const all = menus[role];
  const [more, setMore] = useState(false);
  // Paritas mobile: maksimal 4 item + "Lainnya" (bottom-sheet) agar semua aksi desktop tetap ada.
  const shown = all.length > 5 ? all.slice(0, 4) : all;
  const rest = all.length > 5 ? all.slice(4) : [];
  const cols = shown.length + (rest.length ? 1 : 0);
  const active = (href: string) => path === href || (href !== `/${role}` && path.startsWith(href));
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${cols},minmax(0,1fr))` }}>
          {shown.map((m) => (
            <Link key={m.href} href={m.href} className={cn("flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold text-slate-400", active(m.href) && "text-brand-600")}>
              <m.icon size={20} className="shrink-0" /><span className="max-w-full truncate px-1">{m.label}</span>
            </Link>
          ))}
          {rest.length > 0 && (
            <button onClick={() => setMore(true)} className={cn("flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 py-2 text-[11px] font-semibold text-slate-400", rest.some((m) => active(m.href)) && "text-brand-600")}>
              <MoreHorizontal size={20} className="shrink-0" /><span className="max-w-full truncate px-1">Lainnya</span>
            </button>
          )}
        </div>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="Menu lainnya">
        <div className="grid gap-1.5">
          {rest.map((m) => (
            <Link key={m.href} href={m.href} onClick={() => setMore(false)} className={cn("flex min-h-[48px] items-center gap-3 rounded-xl px-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50", active(m.href) && "bg-brand-50 text-brand-600")}>
              <m.icon size={18} />{m.label}
            </Link>
          ))}
        </div>
      </Modal>
    </>
  );
}

export function AppShell({ role, title, hint, children }: { role: Role; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-paper text-ink">
      <Sidebar role={role} />
      <div className="min-w-0 flex-1 pb-20 sm:pb-8">
        <Topbar title={title} hint={hint} />
        <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6">{children}</main>
      </div>
      <BottomBar role={role} />
    </div>
  );
}
