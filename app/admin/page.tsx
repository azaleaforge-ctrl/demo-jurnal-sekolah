"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Eye, ImageIcon, PenLine } from "lucide-react";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card, Stat } from "@/src/components/ui/card";
import { Table } from "@/src/components/ui/table";
import { Badge, Skeleton } from "@/src/components/ui/misc";
import { Lightbox } from "@/src/components/lightbox";
import { adminFeed } from "@/src/lib/api";
import { getSharedFeed, mapJournalEntry, byNewest, normalizeRemote, summarizeFeed, type Summary, type FeedEntry } from "@/src/lib/feed";
import { subscribeFeedJournals, useDirectory, updateDocById, type Doc } from "@/src/lib/db";
import { todayID, byName } from "@/src/lib/utils";

const COLORS = ["#2E5BFF", "#F5B83D", "#38BDF8", "#F43F5E"];
const gTone = (s: string | null) => (!s ? "slate" : s === "hadir" ? "green" : s === "izin" ? "blue" : "amber");

export default function AdminHome() {
  const today = todayID();
  const dir = useDirectory();
  const dirLoading = dir.loading;
  const [tanggal, setTanggal] = useState(today);
  // Mode HARIAN: query sempit [date==tanggal] agar payload kecil & Pie/Bar cepat tampil.
  const [raw, setRaw] = useState<{ js: Doc[]; atts: Doc[] } | null>(null);
  const [local, setLocal] = useState<FeedEntry[] | null>(null);
  const [remote, setRemote] = useState<FeedEntry[] | null>(null);
  const demoToast = useRef(false);
  const notifyDemo = () => {
    if (!demoToast.current) { demoToast.current = true; toast.info("Mode demo — memakai data lokal."); }
  };
  const [fClass, setFClass] = useState("");
  const [fTeacher, setFTeacher] = useState("");
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  const guruList = useMemo(() => [...dir.users.filter((u) => u.role === "guru")].sort(byName()), [dir.users]);
  // "Nama, Gelar" (mis. Rina Marlina, S.Kom) — gelar dicari via teacher_id.
  const gelarMap = useMemo(() => new Map(dir.users.filter((u) => u.role === "guru").map((u) => [u.id, String((u as any).gelar || "").trim()])), [dir.users]);
  const namaGelarId = (id: string, name: string) => {
    const g = gelarMap.get(id);
    return g ? `${name}, ${g}` : name;
  };
  // Backfill gelar sekali per sesi: doc guru Firestore tanpa gelar → default "S.Pd".
  const gelarFix = useRef(false);
  useEffect(() => {
    if (gelarFix.current || !dir.remote || dirLoading) return;
    const missing = dir.users.filter((u) => u.role === "guru" && !String((u as any).gelar || "").trim());
    if (!missing.length) return;
    gelarFix.current = true;
    (async () => {
      for (const m of missing) {
        try { await updateDocById("users", m.id, { gelar: "S.Pd" }); } catch {}
      }
    })();
  }, [dir.remote, dirLoading, dir.users]);
  const fdir = useMemo(() => ({
    teachers: guruList.map((u) => ({ id: u.id, name: u.name, subject_ids: u.subject_ids })),
    classes: dir.classes.map((c) => ({ id: c.id, name: c.name })),
    subjects: dir.subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
  }), [guruList, dir.classes, dir.subjects]);

  // Geser tanggal YYYY-MM-DD ±n hari (navigasi hari).
  function shiftDay(iso: string, d: number) {
    const [y, m, dd] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, dd);
    dt.setDate(dt.getDate() + d);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }

  // Subscribe sempit [date==tanggal]; grafik dihitung dari snapshot hari itu via memo.
  useEffect(() => {
    if (dirLoading) return;
    let on = true;
    let unsub: (() => void) | null = null;
    (async () => {
      // 1) Backend Laravel bila hidup — rentang 1 hari saja
      try {
        const f = await adminFeed({ tanggal_dari: tanggal, sampai: tanggal });
        if (!on) return;
        setRemote(f.map((r: any) => normalizeRemote(r)));
        return;
      } catch {}
      // 2) Firestore realtime (§5) — lingkup 1 hari, payload kecil.
      try {
        unsub = subscribeFeedJournals([["date", "==", tanggal]],
          (js, atts) => { if (on) setRaw({ js, atts }); },
          () => {
            if (!on) return;
            setLocal(getSharedFeed().filter((j) => j.date === tanggal));
            notifyDemo();
          });
        return;
      } catch {}
      // 3) Fallback mock bila Firestore tak terjangkau
      if (!on) return;
      setLocal(getSharedFeed().filter((j) => j.date === tanggal));
      notifyDemo();
    })();
    return () => { on = false; unsub?.(); };
  }, [dirLoading, tanggal]);

  // Remap snapshot mentah → label saat direktori berubah, tanpa resubscribe.
  const mapped = useMemo<FeedEntry[] | null>(() => {
    if (!raw) return null;
    const d = { classes: dir.classes, subjects: dir.subjects, users: dir.users, materials: dir.materials, schedules: dir.schedules };
    return raw.js.map((j) => mapJournalEntry(j, d, raw.atts)).sort(byNewest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, dir.classes, dir.subjects, dir.users, dir.materials, dir.schedules]);

  const feed = remote ?? mapped ?? local ?? [];
  // Grafik dirender hanya setelah payload pertama tiba (lazy).
  const ready = remote !== null || mapped !== null || local !== null;
  const summary = useMemo<Summary | null>(() => {
    if (!ready) return null;
    return summarizeFeed(feed, tanggal, tanggal.slice(0, 7), fdir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, feed, tanggal, fdir]);

  // Section per guru selalu A-Z (locale id, case-insensitive), tampil "Nama, Gelar".
  const perTeacher = useMemo(() => [...(summary?.perTeacher || [])].sort(byName()), [summary]);

  const visible = useMemo(
    () => feed.filter((f) => f.date === tanggal && (!fClass || f.class === fClass || f.class_id === fClass) && (!fTeacher || f.teacher === fTeacher)).slice(0, 6),
    [feed, tanggal, fClass, fTeacher]
  );

  const gPct = summary && summary.guru.total ? Math.round((summary.guru.hadir / summary.guru.total) * 100) : 0;
  const sTot = summary ? summary.siswa.hadir + summary.siswa.sakit + summary.siswa.izin + summary.siswa.alpha : 0;
  const sPct = sTot ? Math.round(((summary?.siswa.hadir || 0) / sTot) * 100) : 0;
  const busy = !summary;

  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Dashboard Admin" hint="Semua jurnal guru mengalir ke sini otomatis">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100 bg-white p-3 shadow-soft">
          <div className="flex min-w-0 items-center gap-1">
            <button onClick={() => setTanggal((t) => shiftDay(t, -1))} aria-label="Hari sebelumnya" className="grid size-9 place-items-center rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">‹</button>
            <label className="min-w-0 text-xs font-semibold text-slate-500">Tanggal <input type="date" value={tanggal} max={today} onChange={(e) => e.target.value && setTanggal(e.target.value)} className="ml-1 max-w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-ink" /></label>
            <button onClick={() => setTanggal((t) => shiftDay(t, 1))} aria-label="Hari berikutnya" disabled={tanggal >= today} className="grid size-9 place-items-center rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">›</button>
            {tanggal !== today && (
              <button onClick={() => setTanggal(today)} className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-100">Hari ini</button>
            )}
          </div>
          <select value={fClass} onChange={(e) => setFClass(e.target.value)} className="max-w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Semua kelas</option>
            {dir.classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
            <select value={fTeacher} onChange={(e) => setFTeacher(e.target.value)} className="max-w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
            <option value="">Semua guru</option>
            {guruList.map((t) => <option key={t.id} value={t.name}>{namaGelarId(t.id, t.name)}</option>)}
          </select>
        </div>

        {busy ? (
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="Total guru" value={String(summary?.guru.total ?? "…")} hint="Akun guru aktif" />
            <Stat label="Jumlah Siswa" value={dirLoading ? "…" : String(dir.students.length)} hint="Terdaftar di sistem" />
            <Stat label={`Sudah isi ${tanggal.slice(5)}`} value={String((summary?.guru.hadir ?? 0) + (summary?.guru.izin ?? 0) + (summary?.guru.sakit ?? 0))} hint="Jurnal masuk hari itu" />
            <Stat label="Belum isi" value={String(summary?.guru.belum_isi ?? "…")} hint="Perlu diingatkan" />
            <Stat label="% hadir guru" value={`${gPct}%`} hint={`Tanggal ${tanggal.slice(5)}`} />
            <Stat label="% hadir siswa" value={`${sPct}%`} hint={`Tanggal ${tanggal.slice(5)}`} />
            <Stat label="Jurnal hari ini" value={String(feed.length)} hint="Masuk pada tanggal terpilih" />
          </div>
        )}

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Card className="min-w-0">
            <h2 className="font-display font-bold">Kehadiran siswa — {tanggal.slice(5)}</h2>
            <div className="mt-2 h-56 text-xs sm:h-64">
              {!ready ? <Skeleton className="h-full w-full" /> : (
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
              )}
            </div>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Card className="min-w-0">
              <h2 className="font-display font-bold">Status guru</h2>
              <div className="mt-2 h-56 text-xs sm:h-64">
                {!ready ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={(summary?.guruPie || []).slice(0, 6)} dataKey="value" nameKey="name" outerRadius={80} label>
                      {(summary?.guruPie || []).slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                )}
              </div>
            </Card>
            <Card className="min-w-0">
              <h2 className="font-display font-bold">Status siswa</h2>
              <div className="mt-2 h-56 text-xs sm:h-64">
                {!ready ? <Skeleton className="h-full w-full" /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={(summary?.siswaPie || []).slice(0, 6)} dataKey="value" nameKey="name" outerRadius={80} label>
                      {(summary?.siswaPie || []).slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <Card className="lg:col-span-3 min-w-0">
            <h2 className="font-display font-bold">Status per guru — {tanggal}</h2>
            <div className="mt-3">
              <Table head={["Guru", "Mapel", "Status", "Aksi"]}>
                {perTeacher.map((t) => (
                  <tr key={t.teacher_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold"><span className="block max-w-[42vw] truncate sm:max-w-none" title={namaGelarId(t.teacher_id, t.name)}>{namaGelarId(t.teacher_id, t.name)}</span></td>
                    <td className="px-4 py-3 text-slate-500">{t.mapel}</td>
                    <td className="px-4 py-3">
                      {!t.submitted_today ? <Badge tone="slate">Belum isi</Badge> : <Badge tone={gTone(t.teacher_status) as any}>{t.teacher_status}</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setFTeacher(t.name); feedRef.current?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-100" title="Lihat jurnal guru ini">
                        <Eye size={13} /> Lihat
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>
          <Card className="lg:col-span-2 min-w-0">
            <h2 className="font-display font-bold">Agregat per kelas</h2>
            <div className="mt-3">
              <Table head={["Kelas", "H", "S", "I", "A"]}>
                {(summary?.perClass || []).map((c) => (
                  <tr key={c.class_id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold">{c.name}</td>
                    <td className="px-4 py-3">{c.hadir}</td>
                    <td className="px-4 py-3">{c.sakit}</td>
                    <td className="px-4 py-3">{c.izin}</td>
                    <td className="px-4 py-3">{c.alpha}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>
        </div>

        <div ref={feedRef} className="mt-4 min-w-0 scroll-mt-24">
          <Card>
            <h2 className="font-display font-bold">Jurnal masuk — {tanggal}</h2>
            <div className="mt-3 space-y-2">
              {visible.length === 0 && ready && (
                <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">
                  {tanggal === today
                    ? "Belum ada jurnal hari ini — data masuk saat guru mengisi."
                    : "Tidak ada jurnal pada tanggal ini. Arsip hanya segel metadata — jurnal lama tetap bisa dibuka lewat tanggal ini."}
                </p>
              )}
              {visible.map((j) => (
                <div key={j.id} className="flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{j.subject} · {j.class}</p>
                    <p className="truncate text-xs text-slate-500">{j.teacher} · {j.date} · {j.material}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone={gTone(j.teacher_status) as any}>{j.teacher_status}</Badge>
                      <Badge tone="green">H:{j.stats.hadir}</Badge>
                      <Badge tone="red">A:{j.stats.alpha}</Badge>
                    </div>
                  </div>
                  {j.photo ? (
                    <button type="button" onClick={() => setZoom({ src: j.photo, label: `Foto — ${j.subject} ${j.class}` })} title="Klik untuk perbesar" className="block size-14 shrink-0 overflow-hidden rounded-xl">
                      <img src={j.photo} alt="bukti" className="size-14 cursor-zoom-in object-cover" />
                    </button>
                  ) : (
                    <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-slate-200/60 text-slate-400"><ImageIcon size={16} /></span>
                  )}
                  {j.signature ? (
                    <button type="button" onClick={() => setZoom({ src: j.signature, label: `TTD — ${j.subject} ${j.class}` })} title="Klik untuk perbesar" className="block h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-white">
                      <img src={j.signature} alt="ttd" className="h-14 w-24 cursor-zoom-in bg-white object-contain" />
                    </button>
                  ) : (
                    <span className="grid h-14 w-24 shrink-0 place-items-center rounded-xl border border-dashed border-slate-200 text-slate-400"><PenLine size={16} /></span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="mt-4">
          <h2 className="font-display font-bold">Aksi cepat</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {[["/admin/siswa", "Kelola Siswa"], ["/admin/kelas", "Kelola Kelas"], ["/admin/guru", "Kelola Guru"], ["/admin/akun", "Generator Akun"], ["/admin/export", "Export Center"]].map(([h, l]) => (
              <Link key={h} href={h} className="rounded-xl bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-600 hover:bg-brand-100">{l}</Link>
            ))}
          </div>
        </Card>
        {zoom && <Lightbox src={zoom.src} label={zoom.label} onClose={() => setZoom(null)} />}
      </AppShell>
    </Guard>
  );
}
