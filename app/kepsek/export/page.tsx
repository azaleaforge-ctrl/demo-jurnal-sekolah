"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Download, FileSpreadsheet, FileText, Inbox } from "lucide-react";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Skeleton, Spinner } from "@/src/components/ui/misc";
import { cn } from "@/src/lib/utils";
import { downloadRekap, filterRekap, type RekapTipe, type ExportDir, type PeriodeMode } from "@/src/lib/export";
import { getSharedFeed, mapJournalEntry, byNewest, normalizeRemote, type FeedEntry } from "@/src/lib/feed";
import { subscribeFeedJournals, useDirectory, getSetting, mockSetting, type Doc } from "@/src/lib/db";
import { adminFeed } from "@/src/lib/api";
import { todayID } from "@/src/lib/utils";

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
  return [`${bulan}-01`, `${bulan}-${new Date(y, m, 0).getDate()}`];
}

export default function KepsekExportPage() {
  const today = todayID();
  const dir = useDirectory();
  const dirLoading = dir.loading;
  const [tipe, setTipe] = useState<RekapTipe>("guru");
  const [periode, setPeriode] = useState<PeriodeMode>("mingguan");
  const [dari, setDari] = useState(() => weekRange(new Date())[0]);
  const [sampai, setSampai] = useState(() => weekRange(new Date())[1]);
  const [tanggal, setTanggal] = useState(today);
  const [bulan, setBulan] = useState(today.slice(0, 7));
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [prog, setProg] = useState("");
  // Snapshot mentah (tanpa label) — remap via memo agar dir baru tak picu resubscribe.
  const [raw, setRaw] = useState<{ js: Doc[]; atts: Doc[] } | null>(null);
  const [fallback, setFallback] = useState<FeedEntry[] | null>(null);
  const demoToast = useRef(false);
  const notifyDemo = () => {
    if (!demoToast.current) { demoToast.current = true; toast.info("Mode demo — memakai data lokal."); }
  };
  const [sch, setSch] = useState(mockSetting());

  // Setting sekolah dibaca sekali; tak ikut resubscribe saat filter tanggal berubah.
  useEffect(() => {
    let on = true;
    getSetting()
      .then((s) => { if (on && s) setSch({ school_name: s.school_name, academic_year: s.academic_year, semester: s.semester.toLowerCase() === "genap" ? "Genap" : "Ganjil", principal_name: s.principal_name }); })
      .catch(() => {});
    return () => { on = false; };
  }, []);

  // Subscribe hanya berdasar `dari`; `sampai` diterapkan client via filterRekap.
  useEffect(() => {
    if (dirLoading) return;
    let on = true;
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        const rows = (await adminFeed({ tanggal_dari: dari, sampai })).map((r: any) => normalizeRemote(r));
        if (on) setFallback(rows);
        return;
      } catch {}
      try {
        unsub = subscribeFeedJournals([["date", ">=", dari || "0000-00-00"]],
          (js, atts) => { if (on) setRaw({ js, atts }); },
          () => {
            if (!on) return;
            setFallback(getSharedFeed());
            notifyDemo();
          });
        return;
      } catch {}
      if (!on) return;
      setFallback(getSharedFeed());
      notifyDemo();
    })();
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

  const xdir: ExportDir = useMemo(() => ({
    school: { name: sch.school_name, academicYear: sch.academic_year, semester: sch.semester.toLowerCase() === "genap" ? "Genap" : "Ganjil", principalName: (sch as any).principal_name },
    students: dir.students.map((s) => ({ id: s.id, nisn: s.nisn, name: s.name, class_id: s.class_id })),
    classes: dir.classes.map((c) => ({ id: c.id, name: c.name, wali: (c as any).wali })),
    teachers: dir.users.filter((u) => u.role === "guru").map((t) => ({ id: t.id, name: t.name, gelar: t.gelar })),
  }), [dir, sch]);

  const rows = useMemo(() => {
    try {
      return filterRekap(feed, dari, sampai, { tipe, classId: classId || undefined, teacherId: teacherId || undefined }, xdir);
    } catch {
      return [];
    }
  }, [feed, dari, sampai, classId, teacherId, tipe, xdir]);
  const siswaCount = useMemo(() => {
    const clsNames = new Set(rows.map((r) => r.class));
    return xdir.students.filter((s) => clsNames.has(xdir.classes.find((c) => c.id === s.class_id)?.name || "")).length;
  }, [rows, xdir]);

  async function run(format: "xlsx" | "pdf") {
    if (busy) return;
    if (tipe === "guru" && !teacherId) return toast.error("Pilih guru terlebih dahulu.");
    if (tipe === "siswa" && !classId) return toast.error("Pilih kelas terlebih dahulu.");
    const id = `${format}-${tipe}`;
    setBusy(id);
    setProg("");
    try {
      const mode = await downloadRekap({ tipe, periode, format, dari, sampai, classId: classId || undefined, teacherId: teacherId || undefined, feed, dir: xdir, onProgress: (d, t) => setProg(`${d}/${t}`) });
      toast.success(mode === "remote" ? "File dari server diunduh." : "File rekap diunduh (dibuat lokal).");
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat file.");
    } finally {
      setBusy(null);
      setProg("");
    }
  }

  const cards = [
    { format: "xlsx" as const, icon: FileSpreadsheet, label: `Rekap ${tipe === "guru" ? "Guru" : "Siswa"} (Excel)`, desc: "Header biru, border, freeze & filter, baris TOTAL." },
    { format: "pdf" as const, icon: FileText, label: `Rekap ${tipe === "guru" ? "Guru" : "Siswa"} (PDF)`, desc: "Kop sekolah, tabel rapi, blok tanda tangan." },
  ];

  return (
    <Guard roles={["kepsek"]}>
      <AppShell role="kepsek" title="Export Center" hint="Read-only — unduh rekap, tanpa arsip / hapus data">
        <nav aria-label="Navigasi kepsek" className="mb-3 flex flex-wrap gap-2">
          {[["/kepsek", "Dashboard"], ["/kepsek/guru", "Rekap Guru"], ["/kepsek/siswa", "Rekap Siswa"]].map(([h, l]) => (
            <Link key={h} href={h} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-600 shadow-soft hover:bg-brand-50">{l}</Link>
          ))}
        </nav>
        <Card>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Tipe rekap</span>
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                {(["guru", "siswa"] as const).map((t) => (
                  <button key={t} onClick={() => { setTipe(t); setClassId(""); setTeacherId(""); }} className={cn("min-h-[44px] flex-1 rounded-lg px-3 py-1.5 capitalize sm:min-h-0 sm:flex-none sm:px-4", tipe === t ? "bg-white shadow-soft" : "text-slate-500")}>
                    {t === "guru" ? "Guru" : "Siswa"}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Periode</span>
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
                {(["harian", "mingguan", "bulanan"] as const).map((p) => (
                  <button key={p} onClick={() => {
                    setPeriode(p);
                    if (p === "harian") { setDari(tanggal); setSampai(tanggal); }
                    else if (p === "mingguan") { const [a, b] = weekRange(new Date()); setDari(a); setSampai(b); }
                    else { const [a, b] = monthRange(bulan); setDari(a); setSampai(b); }
                  }} className={cn("min-h-[44px] flex-1 rounded-lg px-3 py-1.5 capitalize sm:min-h-0 sm:flex-none sm:px-4", periode === p ? "bg-white shadow-soft" : "text-slate-500")}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {periode === "harian" && (
              <label className="col-span-2 min-w-0 text-sm font-semibold text-slate-700 sm:col-span-1">Tanggal <input type="date" value={tanggal} onChange={(e) => { setTanggal(e.target.value); setDari(e.target.value); setSampai(e.target.value); }} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
            )}
            {periode === "mingguan" && (
              <>
                <label className="min-w-0 text-sm font-semibold text-slate-700">Dari <input type="date" value={dari} onChange={(e) => setDari(e.target.value)} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
                <label className="min-w-0 text-sm font-semibold text-slate-700">Sampai <input type="date" value={sampai} onChange={(e) => setSampai(e.target.value)} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
              </>
            )}
            {periode === "bulanan" && (
              <label className="col-span-2 min-w-0 text-sm font-semibold text-slate-700 sm:col-span-1">Bulan <input type="month" value={bulan} onChange={(e) => { setBulan(e.target.value); const [a, b] = monthRange(e.target.value); setDari(a); setSampai(b); }} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" /></label>
            )}
            {tipe === "siswa" ? (
              <label className="min-w-0 text-sm font-semibold text-slate-700">Kelas (wajib)
                <select value={classId} onChange={(e) => setClassId(e.target.value)} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal">
                  <option value="">Pilih kelas…</option>
                  {xdir.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            ) : (
              <label className="min-w-0 text-sm font-semibold text-slate-700">Guru (wajib)
                <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal">
                  <option value="">Pilih guru…</option>
                  {xdir.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <span><b>{rows.length}</b> jurnal</span><span className="text-slate-300">·</span>
            {tipe === "guru" ? (
              <span className="truncate"><b>{xdir.teachers.find((t) => t.id === teacherId)?.name || "—"}</b></span>
            ) : (
              <span><b>{siswaCount}</b> siswa terdampak</span>
            )}
          </div>
        </Card>

        {rows.length === 0 ? (
          <div className="mt-4 grid place-items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-500"><Inbox size={22} /></span>
            <p className="font-display font-bold">Tidak ada data pada filter ini</p>
            <p className="max-w-xs text-sm text-slate-500">
              {(tipe === "guru" && !teacherId) || (tipe === "siswa" && !classId)
                ? `Pilih ${tipe === "guru" ? "guru" : "kelas"} terlebih dahulu.`
                : "Longgarkan rentang tanggal."}
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {cards.map((c) => {
              const id = `${c.format}-${tipe}`;
              return (
                <Card key={id}>
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><c.icon size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display font-bold">{c.label}</p>
                      <p className="text-sm text-slate-500">{c.desc}</p>
                      {busy === id ? (
                        <div className="mt-3 space-y-2"><Skeleton className="h-2.5 w-full" /><Skeleton className="h-2.5 w-2/3" /></div>
                      ) : (
                        <Button className="mt-3 w-full sm:w-auto" disabled={!!busy} onClick={() => run(c.format)}>
                          {busy ? <Spinner /> : <Download size={15} />} Unduh
                        </Button>
                      )}
                      {busy === id && <Button className="mt-3" disabled><Spinner /> Memproses…{prog ? ` ${prog}` : ""}</Button>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </AppShell>
    </Guard>
  );
}
