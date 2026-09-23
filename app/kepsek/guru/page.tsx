"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ImageIcon, Search, X } from "lucide-react";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { Table } from "@/src/components/ui/table";
import { Badge, Empty, Skeleton } from "@/src/components/ui/misc";
import { Lightbox } from "@/src/components/lightbox";
import { cn, todayID, byName } from "@/src/lib/utils";
import { getSharedFeed, mapJournalEntry, byNewest, type FeedEntry } from "@/src/lib/feed";
import { subscribeFeedJournals, useDirectory, updateDocById, type Doc } from "@/src/lib/db";

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekRange(base: Date): [string, string] {
  const mon = new Date(base);
  mon.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return [isoDay(mon), isoDay(sun)];
}
function monthRange(bulan: string): [string, string] {
  const [y, m] = bulan.split("-").map(Number);
  if (!y || !m) return ["", ""];
  return [`${bulan}-01`, `${bulan}-${new Date(y, m, 0).getDate()}`];
}

type Preset = "hari-ini" | "mingguan" | "bulanan" | "custom";
type StatusF = "semua" | "hadir" | "tidak-hadir";

// H/S/I = kehadiran GURU dari teacher_status per jurnal (bukan murid). Tanpa Alpha.
const isHadir = (j: FeedEntry) => j.teacher_status === "hadir";
const tone = (s: string) => (s === "hadir" ? "green" : s === "izin" ? "blue" : s === "sakit" ? "amber" : "slate");
// "Nama, Gelar" di semua tampilan (mis. Rina Marlina, S.Kom).
const namaGelar = (r: any) => (String(r?.gelar || "").trim() ? `${r?.name}, ${String(r.gelar).trim()}` : String(r?.name || "–"));
// "YYYY-MM-DD HH:mm:ss" → "HH:MM"; kosong → "–".
const jamIsi = (created?: string) => (String(created || "").split(" ")[1] || "").slice(0, 5) || "–";
const tglPendek = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "–");

export default function KepsekGuruPage() {
  const today = todayID();
  const dir = useDirectory();
  const dirLoading = dir.loading;
  // Snapshot mentah (tanpa label) — remap ke nama via memo agar dir baru tak picu resubscribe.
  const [raw, setRaw] = useState<{ js: Doc[]; atts: Doc[] } | null>(null);
  const [fallback, setFallback] = useState<FeedEntry[] | null>(null);
  const demoToast = useRef(false);
  const notifyDemo = () => {
    if (!demoToast.current) { demoToast.current = true; toast.info("Mode demo — memakai data lokal."); }
  };

  const [teacherId, setTeacherId] = useState("");
  const [cariGuru, setCariGuru] = useState("");
  const [preset, setPreset] = useState<Preset>("mingguan");
  const [dari, setDari] = useState(() => weekRange(new Date())[0]);
  const [sampai, setSampai] = useState(() => weekRange(new Date())[1]);
  const [status, setStatus] = useState<StatusF>("semua");
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);

  const guruList = useMemo(() => dir.users.filter((u) => u.role === "guru"), [dir.users]);
  const guruOpts = useMemo(() => {
    const q = cariGuru.trim().toLowerCase();
    const list = q ? guruList.filter((g) => g.name.toLowerCase().includes(q)) : guruList;
    return [...list].sort(byName());
  }, [guruList, cariGuru]);
  const guruAktif = useMemo(() => guruList.find((g) => g.id === teacherId), [guruList, teacherId]);

  // Backfill gelar sekali per sesi: doc guru Firestore tanpa gelar → default "S.Pd".
  const gelarFix = useRef(false);
  useEffect(() => {
    if (gelarFix.current || !dir.remote || dirLoading) return;
    const missing = guruList.filter((u) => !String((u as any).gelar || "").trim());
    if (!missing.length) return;
    gelarFix.current = true;
    (async () => {
      for (const m of missing) {
        try { await updateDocById("users", m.id, { gelar: "S.Pd" }); } catch {}
      }
    })();
  }, [dir.remote, dirLoading, guruList]);

  // created_at per jurnal (otomatis saat dibuat; ubah absensi tak meresetnya).
  const createdMap = useMemo(() => new Map((raw?.js || []).map((j) => [j.id, String((j as any).created_at || "")])), [raw]);
  const dibuat = (j: FeedEntry) => createdMap.get(j.id) ?? String((j as any).created_at || "");

  function applyPreset(p: Preset) {
    setPreset(p);
    if (p === "hari-ini") { setDari(today); setSampai(today); }
    else if (p === "mingguan") { const [a, b] = weekRange(new Date()); setDari(a); setSampai(b); }
    else if (p === "bulanan") { const [a, b] = monthRange(today.slice(0, 7)); setDari(a); setSampai(b); }
  }

  // Subscribe hanya berdasar `dari`; data lama tetap tampil saat preset diganti (tanpa kedip).
  useEffect(() => {
    if (dirLoading) return;
    let on = true;
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeFeedJournals([["date", ">=", dari || "0000-00-00"]],
        (js, atts) => { if (on) setRaw({ js, atts }); },
        () => { if (!on) return; setFallback(getSharedFeed()); notifyDemo(); });
    } catch {
      if (on) { setFallback(getSharedFeed()); notifyDemo(); }
    }
    return () => { on = false; unsub?.(); };
  }, [dirLoading, dari]);

  // Remap snapshot mentah → label saat direktori berubah, tanpa resubscribe.
  const feed = useMemo<FeedEntry[]>(() => {
    if (raw) {
      const d = { classes: dir.classes, subjects: dir.subjects, users: dir.users, materials: dir.materials, schedules: dir.schedules };
      return raw.js.map((j) => mapJournalEntry(j, d, raw.atts)).sort(byNewest);
    }
    return fallback ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, fallback, dir.classes, dir.subjects, dir.users, dir.materials, dir.schedules]);

  // Skeleton hanya sebelum payload pertama; update berikutnya diam-diam.
  const loading = raw === null && fallback === null;

  // Base = filter guru+tanggal (SEBELUM status) → ringkasan selalu benar berdampingan.
  // Urutan: terbaru di atas (created_at desc, fallback date desc).
  const base = useMemo(() => {
    if (!teacherId || !guruAktif) return [];
    return feed
      .filter((j) => j.teacher_id === teacherId || j.teacher === guruAktif.name)
      .filter((j) => (!dari || j.date >= dari) && (!sampai || j.date <= sampai))
      .sort((a, b) =>
        dibuat(b).localeCompare(dibuat(a)) ||
        String(b.date || "").localeCompare(String(a.date || "")) ||
        String(b.id || "").localeCompare(String(a.id || "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, teacherId, guruAktif, dari, sampai, createdMap]);

  // Tabel menerapkan filter status; tiap baris = 1 jurnal 1 tanggal (bukan agregat).
  const rows = useMemo(() => {
    return base.filter((j) => status === "semua" || (status === "hadir" ? isHadir(j) : !isHadir(j)));
  }, [base, status]);

  const ringkas = useMemo(() => {
    const c = { h: 0, s: 0, i: 0 };
    base.forEach((j) => {
      if (j.teacher_status === "hadir") c.h++;
      else if (j.teacher_status === "sakit") c.s++;
      else if (j.teacher_status === "izin") c.i++;
    });
    return { total: base.length, hadir: c.h, sakit: c.s, izin: c.i, takHadir: c.s + c.i };
  }, [base]);

  // Mode harian (dari==sampai): tampilkan Status badge. Rentang: sembunyikan Status, H/S/I cukup.
  const isDaily = dari !== "" && dari === sampai;

  return (
    <Guard roles={["kepsek"]}>
      <AppShell role="kepsek" title="Rekap Guru" hint="Read-only — pilih 1 guru untuk memantau jurnalnya">
        <nav aria-label="Navigasi kepsek" className="mb-3 flex flex-wrap gap-2">
          {[["/kepsek", "Dashboard"], ["/kepsek/siswa", "Rekap Siswa"], ["/kepsek/export", "Export Center"]].map(([h, l]) => (
            <Link key={h} href={h} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-600 shadow-soft hover:bg-brand-50">{l}</Link>
          ))}
        </nav>

        <Card>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Cari nama guru</span>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={cariGuru} onChange={(e) => setCariGuru(e.target.value)} placeholder="Ketik nama…"
                  aria-label="Cari nama guru"
                  className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                {cariGuru && (
                  <button type="button" onClick={() => setCariGuru("")} aria-label="Hapus pencarian guru" className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
                    <X size={15} />
                  </button>
                )}
              </div>
              <label className="mt-2 block text-sm font-semibold text-slate-700">Pilih guru (wajib)
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal">
                  <option value="">Pilih guru…</option>
                  {guruOpts.map((g) => <option key={g.id} value={g.id}>{namaGelar(g)}</option>)}
                </select>
              </label>
              {cariGuru.trim() && guruOpts.length === 0 && (
                <p className="mt-1.5 text-xs text-slate-500">Tidak ada guru yang cocok dengan “{cariGuru.trim()}”.</p>
              )}
            </div>
            <div className="min-w-0">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Periode</span>
              <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                {(["hari-ini", "mingguan", "bulanan", "custom"] as const).map((p) => (
                  <button key={p} onClick={() => applyPreset(p)} className={cn("min-h-[44px] flex-1 rounded-lg px-3 py-1.5 capitalize sm:min-h-0", preset === p ? "bg-white shadow-soft" : "text-slate-500")}>
                    {p === "hari-ini" ? "Hari ini" : p}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="min-w-0 text-sm font-semibold text-slate-700">Dari <input type="date" value={dari} onChange={(e) => { setDari(e.target.value); setPreset("custom"); }} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
                <label className="min-w-0 text-sm font-semibold text-slate-700">Sampai <input type="date" value={sampai} onChange={(e) => { setSampai(e.target.value); setPreset("custom"); }} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
              </div>
              <span className="mb-1.5 mt-2 block text-sm font-semibold text-slate-700">Status kehadiran guru</span>
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                {(["semua", "hadir", "tidak-hadir"] as const).map((s) => (
                  <button key={s} onClick={() => setStatus(s)} className={cn("min-h-[44px] flex-1 rounded-lg px-3 py-1.5 capitalize sm:min-h-0", status === s ? "bg-white shadow-soft" : "text-slate-500")}>
                    {s === "tidak-hadir" ? "Tidak hadir" : s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span><b>{ringkas.total}</b> jurnal</span><span className="text-slate-300">·</span>
            <span><b>{guruAktif ? namaGelar(guruAktif) : "—"}</b></span><span className="text-slate-300">·</span>
            <span>H <b>{ringkas.hadir}</b></span><span className="text-slate-300">·</span>
            <span>S <b>{ringkas.sakit}</b></span><span className="text-slate-300">·</span>
            <span>I <b>{ringkas.izin}</b></span>
          </div>
          <p className="mt-2 text-xs text-slate-400">H/S/I = kehadiran guru (bukan murid). Tidak hadir = sakit atau izin. TTD guru disembunyikan.</p>
        </Card>

        <div className="mt-4">
          {loading ? (
            <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
          ) : !teacherId ? (
            <Empty title="Pilih guru terlebih dahulu" hint="Cari nama di atas, lalu pilih 1 guru — hanya jurnal guru itu yang tampil." />
          ) : rows.length === 0 ? (
            <Empty title="Tidak ada jurnal pada filter ini" hint="Longgarkan rentang tanggal atau ubah filter status." />
          ) : isDaily ? (
            <Table head={["Tanggal", "Mapel", "Kelas", "Materi", "Status", "Waktu Isi", "Foto"]}>
              {rows.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-3">{j.date}</td>
                  <td className="px-4 py-3 font-semibold">{j.subject}</td>
                  <td className="px-4 py-3">{j.class}</td>
                  <td className="max-w-[220px] truncate px-4 py-3 text-slate-500" title={j.material}>{j.material}</td>
                  <td className="px-4 py-3"><Badge tone={tone(j.teacher_status) as any}>{j.teacher_status}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs" title={dibuat(j) || j.date}>
                    <span className="font-bold">{jamIsi(dibuat(j))}</span>
                    <span className="block text-slate-400">{tglPendek(j.date)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {j.photo ? (
                      <button type="button" onClick={() => setZoom({ src: j.photo, label: `Foto — ${j.subject} · ${j.class} · ${j.date}` })} title="Klik untuk perbesar" className="block size-12 overflow-hidden rounded-xl">
                        <img src={j.photo} alt="bukti" className="size-12 cursor-zoom-in object-cover" />
                      </button>
                    ) : (
                      <span className="grid size-12 place-items-center rounded-xl bg-slate-200/60 text-slate-400"><ImageIcon size={15} /></span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={["Tanggal", "Mapel", "Kelas", "H", "S", "I", "Waktu Isi", "Foto"]}>
              {rows.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-3">{j.date}</td>
                  <td className="px-4 py-3 font-semibold">{j.subject}</td>
                  <td className="px-4 py-3">{j.class}</td>
                  <td className="px-4 py-3 font-bold">{j.teacher_status === "hadir" ? "1" : "–"}</td>
                  <td className="px-4 py-3 font-bold">{j.teacher_status === "sakit" ? "1" : "–"}</td>
                  <td className="px-4 py-3 font-bold">{j.teacher_status === "izin" ? "1" : "–"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs" title={dibuat(j) || j.date}>
                    <span className="font-bold">{jamIsi(dibuat(j))}</span>
                    <span className="block text-slate-400">{tglPendek(j.date)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {j.photo ? (
                      <button type="button" onClick={() => setZoom({ src: j.photo, label: `Foto — ${j.subject} · ${j.class} · ${j.date}` })} title="Klik untuk perbesar" className="block size-12 overflow-hidden rounded-xl">
                        <img src={j.photo} alt="bukti" className="size-12 cursor-zoom-in object-cover" />
                      </button>
                    ) : (
                      <span className="grid size-12 place-items-center rounded-xl bg-slate-200/60 text-slate-400"><ImageIcon size={15} /></span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
        {zoom && <Lightbox src={zoom.src} label={zoom.label} onClose={() => setZoom(null)} />}
      </AppShell>
    </Guard>
  );
}
