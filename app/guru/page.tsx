"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PenLine, History, Clock } from "lucide-react";
import { Guard, useAuth } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card, Stat } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/misc";
import { journals as mockJournals } from "@/src/lib/mock";
import { subscribeFeedJournals, useDirectory, type Doc } from "@/src/lib/db";
import { byNewest, mapJournalEntry, weekLoad, type FeedEntry } from "@/src/lib/feed";
import { todayID } from "@/src/lib/utils";

export default function GuruHome() {
  const { user } = useAuth();
  const dir = useDirectory();
  const today = todayID();
  const bulan = today.slice(0, 7);
  const [live, setLive] = useState<{ js: Doc[]; atts: Doc[] } | null>(null);
  const [mine, setMine] = useState<FeedEntry[]>([]);

  // Realtime: jurnal milik guru login — perubahan di device lain langsung muncul.
  useEffect(() => {
    if (!user?.id) { setLive(null); return; }
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeFeedJournals([["teacher_id", "==", user.id]],
        (js, atts) => setLive({ js, atts }),
        () => setLive(null));
    } catch {
      setLive(null);
    }
    return () => unsub?.();
  }, [user?.id]);

  // Arsip lokal hanya fallback offline, bukan sumber ganda.
  useEffect(() => {
    try {
      const arr = JSON.parse(localStorage.getItem("my-journals") || "[]");
      setMine(Array.isArray(arr) ? arr.filter((m: any) => !user?.id || m.teacher_id === user.id || m.teacher === user?.name) : []);
    } catch {
      setMine([]);
    }
  }, [user?.id, user?.name]);

  const dirLists = useMemo(() => ({
    classes: dir.classes, subjects: dir.subjects, users: dir.users,
    materials: dir.materials, schedules: dir.schedules,
  }), [dir]);

  const entries: FeedEntry[] = useMemo(() => {
    if (!live) return [];
    return live.js.map((j) => mapJournalEntry(j, dirLists, live.atts)).sort(byNewest);
  }, [live, dirLists]);

  const online = !!live;
  const shown: any[] = online ? entries : [...mine, ...mockJournals];
  const monthCount = shown.filter((j) => (j.date || "").startsWith(bulan)).length;
  const load = weekLoad(online ? entries : mine, user?.id, user?.name, dir.schedules);
  const recent = [...shown].sort(byNewest).slice(0, 3);

  return (
    <Guard roles={["guru"]}>
      <AppShell role="guru" title="Halo, Ibu/Bapak Guru 👋" hint="Isi jurnal hari ini — cukup 1 menit dari HP">
        <div className="grid grid-cols-2 gap-3">
          {dir.loading && !online && !mine.length ? (
            <>
              <Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
            </>
          ) : (
            <>
              <Stat label="Jurnal bulan ini" value={String(monthCount)} hint="Bulan berjalan" />
              <Stat label="Jam mengajar" value={`${load.jp} JP`} hint={`${load.n} jurnal pekan ini`} />
            </>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link href="/guru/jurnal-baru" className="rounded-2xl bg-ink p-5 text-white shadow-soft transition hover:-translate-y-0.5">
            <PenLine size={22} className="text-accent-400" />
            <p className="font-display mt-2 font-bold">Isi Jurnal Baru</p>
            <p className="text-sm text-white/60">Wizard 4 langkah: kelas → materi → foto & TTD → absensi.</p>
          </Link>
          <Link href="/guru/riwayat" className="rounded-2xl bg-white p-5 shadow-soft transition hover:-translate-y-0.5">
            <History size={22} className="text-brand-500" />
            <p className="font-display mt-2 font-bold">Riwayat Jurnal</p>
            <p className="text-sm text-slate-500">Lihat foto, TTD & cetak PDF rekap pribadi.</p>
          </Link>
        </div>
        <Card className="mt-4">
          <h2 className="flex items-center gap-2 font-display font-bold"><Clock size={17} /> Terakhir diisi</h2>
          <div className="mt-2 space-y-2">
            {recent.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
                <div className="min-w-0"><p className="truncate font-semibold">{j.subject} · {j.class}</p><p className="truncate text-xs text-slate-500">{j.date} · {j.material}</p></div>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">Tersimpan</span>
              </div>
            ))}
          </div>
        </Card>
      </AppShell>
    </Guard>
  );
}
