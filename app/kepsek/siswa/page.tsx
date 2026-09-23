"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { Table } from "@/src/components/ui/table";
import { Badge, Empty, Skeleton } from "@/src/components/ui/misc";
import { Button } from "@/src/components/ui/button";
import { cn, todayID, byName, byNameStr } from "@/src/lib/utils";
import { getSharedFeed, mapJournalEntry, byNewest, type FeedEntry } from "@/src/lib/feed";
import { subscribeFeedJournals, useDirectory, type Doc } from "@/src/lib/db";

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
type StatusF = "semua" | "hadir" | "sakit" | "izin" | "alpha";

type Row = {
  key: string;
  date: string;
  studentId: string;
  nisn: string;
  nama: string;
  kelas: string;
  classId: string;
  mapel: string;
  guru: string;
  status: Exclude<StatusF, "semua">;
};

const tone = (s: string) => (s === "hadir" ? "green" : s === "izin" ? "blue" : s === "sakit" ? "amber" : "red");
const PAGE = 200;
// "YYYY-MM-DD" → "DD/MM" untuk sel ringkas.
const tglPendek = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "–");

type Agg = {
  studentId: string; nisn: string; nama: string;
  kelas: string; classId: string; wali: string;
  h: number; s: number; i: number; a: number;
};

export default function KepsekSiswaPage() {
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

  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [cari, setCari] = useState("");
  const [preset, setPreset] = useState<Preset>("mingguan");
  const [dari, setDari] = useState(() => weekRange(new Date())[0]);
  const [sampai, setSampai] = useState(() => weekRange(new Date())[1]);
  const [status, setStatus] = useState<StatusF>("semua");
  const [shown, setShown] = useState(PAGE);

  function applyPreset(p: Preset) {
    setPreset(p);
    setShown(PAGE);
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

  // created_at per jurnal (otomatis saat dibuat) untuk urutan terbaru-di-atas.
  const createdMap = useMemo(() => new Map((raw?.js || []).map((j) => [j.id, String((j as any).created_at || "")])), [raw]);

  const siswaOpts = useMemo(() => {
    const list = classId ? dir.students.filter((s) => s.class_id === classId) : dir.students;
    return [...list].sort(byName());
  }, [dir.students, classId]);

  // Expand attendances → baris per siswa, join in-memory (tanpa foto, tanpa TTD).
  // Urutan: jurnal terbaru di atas (created_at desc, fallback date desc), nama A-Z.
  const expanded = useMemo<Row[]>(() => {
    const byStudent = new Map(dir.students.map((s) => [s.id, s]));
    const byClass = new Map(dir.classes.map((c) => [c.id, c.name]));
    const dibuat = (jid: string, date: string) => createdMap.get(jid) || date;
    const out: Row[] = [];
    feed
      .filter((j) => (!dari || j.date >= dari) && (!sampai || j.date <= sampai))
      .forEach((j) => {
        (j.attendances || []).forEach((at, i) => {
          const st = byStudent.get(at.student_id);
          const k = String(at.status || "").toLowerCase();
          if (!["hadir", "sakit", "izin", "alpha"].includes(k)) return;
          const cid = st?.class_id || (j.class_id as string) || "";
          out.push({
            key: `${j.id}:${at.student_id}:${i}`,
            date: j.date,
            studentId: at.student_id,
            nisn: st?.nisn || "-",
            nama: st?.name || at.student_id,
            kelas: j.class && j.class !== "-" ? j.class : (byClass.get(cid) || "-"),
            classId: cid,
            mapel: j.subject && j.subject !== "-" ? j.subject : "-",
            guru: j.teacher && j.teacher !== "-" ? j.teacher : "-",
            status: k as Exclude<StatusF, "semua">,
          });
        });
      });
    return out.sort((a, b) =>
      dibuat(b.key.split(":")[0], b.date).localeCompare(dibuat(a.key.split(":")[0], a.date)) ||
      b.date.localeCompare(a.date) || byNameStr(a.nama, b.nama));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, dir.students, dir.classes, dari, sampai, createdMap]);

  // Base = filter kelas/siswa/cari/tanggal (SEBELUM status) → ringkasan selalu benar berdampingan.
  const base = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return expanded
      .filter((r) => !classId || r.classId === classId)
      .filter((r) => !studentId || r.studentId === studentId)
      .filter((r) => !q || `${r.nama} ${r.nisn}`.toLowerCase().includes(q));
  }, [expanded, classId, studentId, cari]);

  // Tabel menerapkan filter status; tiap baris = 1 siswa 1 tanggal (bukan agregat angka).
  const rows = useMemo(() => {
    return base.filter((r) => status === "semua" || r.status === status);
  }, [base, status]);

  const ringkas = useMemo(() => {
    const c = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
    base.forEach((r) => { c[r.status]++; });
    return c;
  }, [base]);

  // Mode harian (dari==sampai): tabel per-baris. Rentang: tabel AGREGAT per siswa (akumulasi harian).
  const isDaily = dari !== "" && dari === sampai;

  // Agregat per siswa dari base (SEBELUM filter status): H/S/I/A angka akumulasi rentang.
  // Filter status memilih siswa yang punya status itu (>0); angka per siswa tetap utuh.
  const agregat = useMemo<Agg[]>(() => {
    const byClassId = new Map(dir.classes.map((c) => [c.id, c]));
    const acc = new Map<string, Agg>();
    base.forEach((r) => {
      let g = acc.get(r.studentId);
      if (!g) {
        const cls = byClassId.get(r.classId) || dir.classes.find((c) => c.name === r.kelas);
        g = {
          studentId: r.studentId, nisn: r.nisn, nama: r.nama,
          kelas: r.kelas, classId: r.classId,
          wali: String((cls as any)?.wali || "").trim() || "–",
          h: 0, s: 0, i: 0, a: 0,
        };
        acc.set(r.studentId, g);
      }
      if (r.status === "hadir") g.h++;
      else if (r.status === "sakit") g.s++;
      else if (r.status === "izin") g.i++;
      else g.a++;
    });
    const list = [...acc.values()];
    const kept = status === "semua" ? list : list.filter((g) => {
      if (status === "hadir") return g.h > 0;
      if (status === "sakit") return g.s > 0;
      if (status === "izin") return g.i > 0;
      return g.a > 0;
    });
    return kept.sort(byName());
  }, [base, status, dir.classes]);

  // Hitungan siswa mengikuti filter kelas/siswa/cari yang aktif (dari dir.students, realtime).
  const siswaCount = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return dir.students.filter((s) =>
      (!classId || s.class_id === classId) &&
      (!studentId || s.id === studentId) &&
      (!q || `${s.name} ${s.nisn || ""}`.toLowerCase().includes(q))).length;
  }, [dir.students, classId, studentId, cari]);
  const kelasAktif = classId ? dir.classes.find((c) => c.id === classId)?.name || "" : "";

  const rentang = `${tglPendek(dari)} s/d ${tglPendek(sampai)}`;

  // Jurnal rentang ini yang tak punya rincian attendances (tak bisa dipecah per siswa).
  const tanpaRincian = useMemo(() => feed.filter(
    (j) => (!dari || j.date >= dari) && (!sampai || j.date <= sampai) && !(j.attendances || []).length
  ).length, [feed, dari, sampai]);

  return (
    <Guard roles={["kepsek"]}>
      <AppShell role="kepsek" title="Rekap Siswa" hint="Read-only — pantau kehadiran per siswa dari jurnal guru">
        <nav aria-label="Navigasi kepsek" className="mb-3 flex flex-wrap gap-2">
          {[["/kepsek", "Dashboard"], ["/kepsek/guru", "Rekap Guru"], ["/kepsek/export", "Export Center"]].map(([h, l]) => (
            <Link key={h} href={h} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-600 shadow-soft hover:bg-brand-50">{l}</Link>
          ))}
        </nav>

        <Card>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Kelas
                <select value={classId} onChange={(e) => { setClassId(e.target.value); setStudentId(""); setShown(PAGE); }} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal">
                  <option value="">Semua kelas</option>
                  {dir.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-700">Siswa {classId ? "(kelas terpilih)" : "(semua kelas)"}
                <select value={studentId} onChange={(e) => { setStudentId(e.target.value); setShown(PAGE); }} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal">
                  <option value="">Semua siswa</option>
                  {siswaOpts.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.nisn}</option>)}
                </select>
              </label>
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Cari nama siswa</span>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={cari} onChange={(e) => { setCari(e.target.value); setShown(PAGE); }} placeholder="Ketik nama / NISN…"
                    aria-label="Cari nama siswa"
                    className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                  {cari && (
                    <button type="button" onClick={() => setCari("")} aria-label="Hapus pencarian siswa" className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
                      <X size={15} />
                    </button>
                  )}
                </div>
              </div>
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
                <label className="min-w-0 text-sm font-semibold text-slate-700">Dari <input type="date" value={dari} onChange={(e) => { setDari(e.target.value); setPreset("custom"); setShown(PAGE); }} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
                <label className="min-w-0 text-sm font-semibold text-slate-700">Sampai <input type="date" value={sampai} onChange={(e) => { setSampai(e.target.value); setPreset("custom"); setShown(PAGE); }} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
              </div>
              <span className="mb-1.5 mt-2 block text-sm font-semibold text-slate-700">Kehadiran</span>
              <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                {(["semua", "hadir", "sakit", "izin", "alpha"] as const).map((s) => (
                  <button key={s} onClick={() => { setStatus(s); setShown(PAGE); }} className={cn("min-h-[44px] flex-1 rounded-lg px-3 py-1.5 capitalize sm:min-h-0", status === s ? "bg-white shadow-soft" : "text-slate-500")}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span><b>{siswaCount}</b> siswa{kelasAktif ? ` di ${kelasAktif}` : " semua kelas"}</span><span className="text-slate-300">·</span>
            <span><b>{isDaily ? base.length : agregat.length}</b> {isDaily ? "baris" : "siswa"}</span><span className="text-slate-300">·</span>
            <span>H <b>{ringkas.hadir}</b></span><span className="text-slate-300">·</span>
            <span>S <b>{ringkas.sakit}</b></span><span className="text-slate-300">·</span>
            <span>I <b>{ringkas.izin}</b></span><span className="text-slate-300">·</span>
            <span>A <b>{ringkas.alpha}</b></span>
            {tanpaRincian > 0 && (<><span className="text-slate-300">·</span><span className="text-slate-500">{tanpaRincian} jurnal tanpa rincian siswa</span></>)}
          </div>
          {!isDaily && <p className="mt-2 text-xs text-slate-400">Mode rentang: angka H/S/I/A = akumulasi harian {rentang}. Filter kehadiran memilih siswa yang punya status itu.</p>}
        </Card>

        <div className="mt-4">
          {loading ? (
            <div className="space-y-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
          ) : isDaily ? (
            rows.length === 0 ? (
              <Empty title="Tidak ada data pada filter ini" hint="Pilih kelas / siswa lain, atau longgarkan rentang tanggal." />
            ) : (
              <>
                <Table head={["Tanggal", "Nama", "Kelas", "Mapel", "Guru mapel", "Kehadiran"]}>
                  {rows.slice(0, shown).map((r) => (
                    <tr key={r.key} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-4 py-3">{r.date}</td>
                      <td className="px-4 py-3 font-semibold">{r.nama} <span className="font-normal text-slate-400">· {r.nisn}</span></td>
                      <td className="px-4 py-3">{r.kelas}</td>
                      <td className="px-4 py-3">{r.mapel}</td>
                      <td className="px-4 py-3 text-slate-500">{r.guru}</td>
                      <td className="px-4 py-3"><Badge tone={tone(r.status) as any}>{r.status}</Badge></td>
                    </tr>
                  ))}
                </Table>
                {shown < rows.length && (
                  <Button variant="outline" className="mt-3 w-full" onClick={() => setShown((s) => s + PAGE)}>
                    Muat lagi ({rows.length - shown} disembunyikan)
                  </Button>
                )}
              </>
            )
          ) : agregat.length === 0 ? (
            <Empty title="Tidak ada data pada filter ini" hint="Pilih kelas / siswa lain, atau longgarkan rentang tanggal." />
          ) : (
            <>
              <Table head={["Tanggal", "Nama", "Kelas", "Wali Kelas", "H", "S", "I", "A"]}>
                {agregat.slice(0, shown).map((g) => (
                  <tr key={g.studentId} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-xs" title={`${dari} s/d ${sampai}`}>{rentang}</td>
                    <td className="px-4 py-3 font-semibold">{g.nama} <span className="font-normal text-slate-400">· {g.nisn}</span></td>
                    <td className="px-4 py-3">{g.kelas}</td>
                    <td className="px-4 py-3 text-slate-500">{g.wali}</td>
                    <td className="px-4 py-3 font-bold">{g.h}</td>
                    <td className="px-4 py-3 font-bold">{g.s}</td>
                    <td className="px-4 py-3 font-bold">{g.i}</td>
                    <td className="px-4 py-3 font-bold">{g.a}</td>
                  </tr>
                ))}
              </Table>
              {shown < agregat.length && (
                <Button variant="outline" className="mt-3 w-full" onClick={() => setShown((s) => s + PAGE)}>
                  Muat lagi ({agregat.length - shown} disembunyikan)
                </Button>
              )}
            </>
          )}
        </div>
      </AppShell>
    </Guard>
  );
}
