"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Download, Loader2 } from "lucide-react";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card, Stat } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Table } from "@/src/components/ui/table";
import { Badge, Spinner, Skeleton } from "@/src/components/ui/misc";
import { cn } from "@/src/lib/utils";
import { getSharedFeed, mapJournalEntry, byNewest, normalizeRemote, summarizeFeed, type FeedEntry, type Summary } from "@/src/lib/feed";
import { subscribeFeedJournals, useDirectory } from "@/src/lib/db";
import { adminFeed } from "@/src/lib/api";
import { downloadRekap } from "@/src/lib/export";
import { todayID } from "@/src/lib/utils";

const COLORS = ["#2E5BFF", "#F5B83D", "#38BDF8", "#F43F5E"];
const gTone = (s: string) => (s === "hadir" ? "green" : s === "izin" ? "blue" : "amber");

export default function KepsekPage() {
  const today = todayID();
  const dir = useDirectory();
  const [tab, setTab] = useState<"harian" | "bulanan">("harian");
  const [busy, setBusy] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  // Satu feed dengan admin & guru — realtime, jurnal baru otomatis muncul di sini.
  useEffect(() => {
    if (dir.loading) return;
    let on = true;
    let unsub: (() => void) | null = null;
    const dirLists = () => ({
      classes: dir.classes, subjects: dir.subjects, users: dir.users,
      materials: dir.materials, schedules: dir.schedules,
    });
    (async () => {
      const fdir = {
        teachers: dir.users.filter((u) => u.role === "guru").map((u) => ({ id: u.id, name: u.name, subject_ids: u.subject_ids })),
        classes: dir.classes.map((c) => ({ id: c.id, name: c.name })),
        subjects: dir.subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
      };
      const bulan = today.slice(0, 7);
      try {
        const remote = (await adminFeed({})).map((r: any) => normalizeRemote(r));
        if (!on) return;
        setFeed(remote);
        setSummary(summarizeFeed(remote, today, bulan, fdir));
        return;
      } catch {}
      try {
        unsub = subscribeFeedJournals([["date", ">=", `${bulan}-01`]],
          (js, atts) => {
            if (!on) return;
            const mapped = js.map((j) => mapJournalEntry(j, dirLists(), atts)).sort(byNewest);
            setFeed(mapped);
            setSummary(summarizeFeed(mapped, today, bulan, fdir));
          },
          () => {
            if (!on) return;
            const local = getSharedFeed();
            setFeed(local);
            setSummary(summarizeFeed(local, today, bulan, fdir));
            toast.info("Mode demo — memakai data lokal.");
          });
        return;
      } catch {}
      if (!on) return;
      const local = getSharedFeed();
      setFeed(local);
      setSummary(summarizeFeed(local, today, bulan, fdir));
      toast.info("Mode demo — memakai data lokal.");
    })();
    return () => { on = false; unsub?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir.loading, dir]);

  async function exp(kind: string) {
    if (busy) return;
    setBusy(kind);
    try {
      const mode = await downloadRekap({ tipe: "guru", format: kind === "pdf" ? "pdf" : "xlsx", dari: "", sampai: "", feed });
      toast.success(mode === "remote" ? "File dari server diunduh." : "File rekap diunduh (dibuat lokal).");
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat file.");
    } finally {
      setBusy(null);
    }
  }

  const s = summary?.siswa;

  return (
    <Guard roles={["kepsek"]}>
      <AppShell role="kepsek" title="Dashboard Eksekutif" hint="Potret kehadiran guru & siswa — data langsung dari jurnal">
        {!summary ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Hadir" value={String(s?.hadir ?? 0)} hint="Siswa bulan berjalan" />
            <Stat label="Sakit" value={String(s?.sakit ?? 0)} hint="Perlu perhatian" />
            <Stat label="Izin" value={String(s?.izin ?? 0)} hint="Terkonfirmasi" />
            <Stat label="Alpha" value={String(s?.alpha ?? 0)} hint="Butuh tindak lanjut" />
          </div>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Card className="min-w-0">
            <h2 className="font-display font-bold">Tren kehadiran harian</h2>
            <div className="mt-2 h-56 text-xs sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary?.trend || []} margin={{ left: -12, right: 4 }}>
                  <XAxis dataKey="tanggal" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="hadir" fill="#2E5BFF" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="sakit" fill="#F5B83D" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="izin" fill="#38BDF8" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="alpha" fill="#F43F5E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="min-w-0">
            <h2 className="font-display font-bold">Komposisi status</h2>
            <div className="mt-2 h-56 text-xs sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={summary?.siswaPie || []} dataKey="value" nameKey="name" outerRadius={90} label>
                    {(summary?.siswaPie || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <Card className="mt-4 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-bold">Rincian jurnal & absensi</h2>
              <div className="mt-2 flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                {(["harian", "bulanan"] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-4 py-1.5 capitalize", tab === t ? "bg-white shadow-soft" : "text-slate-500")}>{t}</button>
                ))}
              </div>
            </div>
            <div className="no-print flex flex-wrap gap-2">
              <Button variant="outline" className="max-sm:flex-1" disabled={!!busy} onClick={() => exp("pdf")}>
                {busy === "pdf" ? <Spinner /> : <Download size={15} />} PDF
              </Button>
              <Button className="max-sm:flex-1" disabled={!!busy} onClick={() => exp("xls")}>
                {busy === "xls" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} {busy === "xls" ? "Memproses…" : "Excel"}
              </Button>
            </div>
          </div>
          <div className="mt-4">
            <Table head={["Tanggal", "Guru", "Kelas", "H", "S", "I", "A"]}>
              {(tab === "harian" ? feed.slice(0, 10) : feed).map((j) => (
                <tr key={j.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">{j.date}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold">{j.teacher}</span>{" "}
                    <Badge tone={gTone(j.teacher_status) as any}>{j.teacher_status}</Badge>
                  </td>
                  <td className="px-4 py-3">{j.class}</td>
                  <td className="px-4 py-3">{j.stats.hadir}</td>
                  <td className="px-4 py-3">{j.stats.sakit}</td>
                  <td className="px-4 py-3">{j.stats.izin}</td>
                  <td className="px-4 py-3">{j.stats.alpha}</td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-xs text-slate-400">Tampilan {tab} · {feed.length} jurnal periode berjalan.</p>
          </div>
        </Card>
      </AppShell>
    </Guard>
  );
}
