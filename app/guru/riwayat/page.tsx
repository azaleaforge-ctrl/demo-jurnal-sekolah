"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Download, ImageIcon, PenLine, Pencil, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Guard, useAuth } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { Badge, Empty, Skeleton, Spinner } from "@/src/components/ui/misc";
import { journals } from "@/src/lib/mock";
import { Lightbox } from "@/src/components/lightbox";
import { subscribeFeedJournals, useDirectory, getSetting, mockSetting, rewriteAttendances, type Doc } from "@/src/lib/db";
import { downloadRekap, type ExportDir } from "@/src/lib/export";
import { mapJournalEntry, resolveStats, type FeedEntry } from "@/src/lib/feed";
import { cn, byName, todayID } from "@/src/lib/utils";
import type { SavedJournal } from "../jurnal-baru/page";

type Row = Omit<SavedJournal, "teacher"> & { teacher: string };
type AttStatus = "hadir" | "sakit" | "izin" | "alpha";

const tone = (s: string) => (s === "hadir" ? "green" : s === "izin" ? "blue" : "amber");
const ATT_LABEL: Record<AttStatus, string> = { hadir: "Hadir", sakit: "Sakit", izin: "Izin", alpha: "Alpha" };

// Navigasi hari: ‹ date-picker › + tombol "Hari ini" (tak bisa maju melewati hari ini).
function DayNav({ tanggal, today, onChange, onShift }: {
  tanggal: string; today: string;
  onChange: (t: string) => void; onShift: (iso: string, d: number) => string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-end gap-1 sm:max-w-[320px] sm:flex-none">
      <button onClick={() => onChange(onShift(tanggal, -1))} aria-label="Hari sebelumnya" className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-base font-bold text-slate-600 hover:bg-slate-50">‹</button>
      <label className="min-w-0 flex-1 text-sm font-semibold text-slate-700">Tanggal
        <input type="date" value={tanggal} max={today} onChange={(e) => e.target.value && onChange(e.target.value)} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal" />
      </label>
      <button onClick={() => onChange(onShift(tanggal, 1))} aria-label="Hari berikutnya" disabled={tanggal >= today} className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-base font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">›</button>
      {tanggal !== today && (
        <button onClick={() => onChange(today)} className="shrink-0 rounded-xl bg-brand-50 px-3 py-2.5 text-xs font-bold text-brand-600 hover:bg-brand-100">Hari ini</button>
      )}
    </div>
  );
}

export default function RiwayatPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const userName = user?.name;
  const today = todayID();
  const dir = useDirectory();
  const dirLoading = dir.loading;
  // Mode HARIAN: default hari ini, query sempit date==tanggal (payload kecil, tanpa loop/kedip).
  const [tanggal, setTanggal] = useState(today);
  const [mine, setMine] = useState<Row[]>([]);
  const [mineReady, setMineReady] = useState(false);
  const [feedRaw, setFeedRaw] = useState<{ js: Doc[]; atts: Doc[] } | null>(null);
  const [demo, setDemo] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);
  const [expBusy, setExpBusy] = useState(false);
  const [expProg, setExpProg] = useState("");
  const [sch, setSch] = useState(mockSetting());
  const [editing, setEditing] = useState<Row | null>(null);
  const [att, setAtt] = useState<Record<string, AttStatus>>({});
  const [savingAtt, setSavingAtt] = useState(false);
  const [cari, setCari] = useState("");
  const toastRef = useRef(false);
  const daftar = editing ? rosterFor(editing) : [];
  const cocok = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return daftar;
    return daftar.filter((s) => `${s.name} ${s.nisn || ""}`.toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cari, editing]);

  const xdir: ExportDir = useMemo(() => ({
    school: { name: sch.school_name, academicYear: sch.academic_year, semester: sch.semester.toLowerCase() === "genap" ? "Genap" : "Ganjil", principalName: (sch as any).principal_name },
    students: dir.students.map((s) => ({ id: s.id, nisn: s.nisn, name: s.name, class_id: s.class_id })),
    classes: dir.classes.map((c) => ({ id: c.id, name: c.name, wali: (c as any).wali })),
    teachers: dir.users.filter((u) => u.role === "guru").map((t) => ({ id: t.id, name: t.name })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dir.students, dir.classes, dir.users, sch]);

  useEffect(() => {
    getSetting()
      .then((s) => { if (s) setSch({ school_name: s.school_name, academic_year: s.academic_year, semester: s.semester.toLowerCase() === "genap" ? "Genap" : "Ganjil", principal_name: s.principal_name }); })
      .catch(() => {});
  }, []);

  const reloadMine = useCallback(() => {
    try {
      const arr = JSON.parse(localStorage.getItem("my-journals") || "[]");
      setMine(Array.isArray(arr) ? arr : []);
    } catch {
      setMine([]);
    } finally {
      setMineReady(true);
    }
  }, []);
  useEffect(() => { reloadMine(); }, [reloadMine]);

  // Geser tanggal YYYY-MM-DD ±n hari (navigasi hari).
  function shiftDay(iso: string, d: number) {
    const [y, m, dd] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, dd);
    dt.setDate(dt.getDate() + d);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }

  // Realtime sempit: 1 hari saja — tulis di HP langsung tampil di desktop.
  // Deps stabil (primitif): tanpa objek baru, tanpa setLoading berulang, toast demo sekali.
  useEffect(() => {
    if (!userId || dirLoading) return;
    let on = true;
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeFeedJournals([["date", "==", tanggal]],
        (js, atts) => { if (on) setFeedRaw({ js, atts }); },
        () => { if (!on) return; setFeedRaw(null); setDemo(true); if (!toastRef.current) { toastRef.current = true; toast.info("Mode demo — memakai data lokal."); } });
    } catch {
      if (!on) return;
      setFeedRaw(null);
      setDemo(true);
      if (!toastRef.current) { toastRef.current = true; toast.info("Mode demo — memakai data lokal."); }
    }
    return () => { on = false; unsub?.(); };
  }, [userId, dirLoading, tanggal]);

  const dirLists = useMemo(() => ({
    classes: dir.classes, subjects: dir.subjects, users: dir.users,
    materials: dir.materials, schedules: dir.schedules,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dir.classes, dir.subjects, dir.users, dir.materials, dir.schedules]);

  // Hanya jurnal milik guru pada tanggal terpilih (filter guru di client — query tetap 1 field).
  const remote: Row[] = useMemo(() => {
    if (!feedRaw) return [];
    const seen = new Set(mine.map((m) => m.id));
    return feedRaw.js
      .filter((j) => !seen.has(j.id))
      .filter((j) => (j.date || "") === tanggal)
      .filter((j) => (userId && (j as any).teacher_id === userId) || ((j as any).teacher === userName))
      .map((j) => ({ ...mapJournalEntry(j, dirLists, feedRaw.atts), teacher: userName || "Saya" } as Row));
  }, [feedRaw, mine, dirLists, tanggal, userId, userName]);

  // created_at per jurnal (otomatis saat dibuat; ubah absensi tak meresetnya).
  // "YYYY-MM-DD HH:mm:ss" → "HH:MM"; kosong → "" (badge disembunyikan).
  const createdMap = useMemo(() => new Map((feedRaw?.js || []).map((j) => [j.id, String((j as any).created_at || "")])), [feedRaw]);
  const dibuat = (r: { id: string }) => createdMap.get(r.id) ?? String((r as any).created_at || "");
  const jamIsi = (created: string) => {
    const m = /(\d{2}):(\d{2})/.exec(String(created || ""));
    return m ? `${m[1]}:${m[2]}` : "";
  };
  // Epoch-ms dari created_at ragam format ("YYYY-MM-DD HH:mm:ss", ISO, angka detik/ms).
  // Kosong/invalid → -Infinity agar selalu di bawah entri yang berjam.
  const jamMs = (v: unknown): number => {
    if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
    const s = String(v ?? "").trim();
    if (!s) return -Infinity;
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : -Infinity;
    }
    const ms = Date.parse(s.includes("T") ? s : s.replace(" ", "T"));
    return Number.isFinite(ms) ? ms : -Infinity;
  };

  // Skeleton hanya sebelum payload pertama; ganti tanggal update diam-diam.
  const ready = mineReady && (feedRaw !== null || demo);

  const rows: Row[] = useMemo(() => {
    const fallback = mine.length || remote.length || !demo
      ? []
      : journals.filter((j) => (j.date || "") === tanggal).map((j) => ({
          ...j, teacher_status: "hadir" as const, leave_note: undefined,
          sick_letter_name: undefined, sick_letter_note: undefined,
        }));
    return [...mine, ...remote, ...fallback]
      .filter((r: any) => (r.date || "") === tanggal)
      .map((r: any) => ({ ...r, stats: resolveStats(r.attendances, r.stats) }))
      // Terbaru di atas: created_at desc (semua sumber), tanpa jam selalu di bawah,
      // tiebreak date desc lalu id desc.
      .sort((a: any, b: any) => {
        const ma = jamMs(createdMap.get(a.id) ?? a.created_at);
        const mb = jamMs(createdMap.get(b.id) ?? b.created_at);
        if (mb !== ma) return mb > ma ? 1 : -1;
        return String(b.date || "").localeCompare(String(a.date || "")) ||
          String(b.id || "").localeCompare(String(a.id || ""));
      });
  }, [mine, remote, demo, tanggal, createdMap]);

  // Mode harian: yang tampil = hari terpilih saja (tanpa "muat lagi" bulanan).
  const visible = rows;

  // Export PDF harian (template formal identik admin), ter-filter guru pemilik + tanggal.
  async function exportPdf() {
    if (!userId) return toast.error("Masuk terlebih dahulu.");
    if (expBusy) return;
    setExpBusy(true);
    setExpProg("");
    try {
      const mode = await downloadRekap({
        tipe: "guru", format: "pdf",
        dari: tanggal, sampai: tanggal,
        teacherId: userId, feed: rows as unknown as FeedEntry[], dir: xdir,
        onProgress: (d, t) => setExpProg(`${d}/${t}`),
      });
      toast.success(mode === "remote" ? "File dari server diunduh." : "File rekap diunduh (dibuat lokal).");
    } catch (e: any) {
      toast.error(e.message || "Gagal membuat file.");
    } finally {
      setExpBusy(false);
      setExpProg("");
    }
  }

  // Daftar siswa entri ini: dari attendances tersimpan, else seluruh siswa kelasnya.
  function rosterFor(j: Row) {
    const ids = (j.attendances || []).map((a) => a.student_id);
    let list = dir.students.filter((s) => ids.includes(s.id));
    if (!list.length) {
      list = dir.students.filter((s) =>
        (j.class_id && s.class_id === j.class_id) ||
        (!j.class_id && dir.classes.find((c) => c.id === s.class_id)?.name === j.class));
    }
    return [...list].sort(byName());
  }

  function openEdit(j: Row) {
    const init: Record<string, AttStatus> = {};
    (j.attendances || []).forEach((a) => {
      const k = String(a.status || "").toLowerCase();
      init[a.student_id] = (["hadir", "sakit", "izin", "alpha"] as AttStatus[]).includes(k as AttStatus) ? (k as AttStatus) : "hadir";
    });
    setAtt(init);
    setCari("");
    setEditing(j);
  }

  // Simpan ubah absensi: rewrite batch Firestore + arsip lokal + stats terhitung ulang.
  async function saveAtt() {
    if (!editing || savingAtt) return;
    setSavingAtt(true);
    const list = rosterFor(editing).map((s) => ({ student_id: s.id, status: att[s.id] || "hadir" }));
    const stats = resolveStats(list);
    let remote = true;
    try {
      await rewriteAttendances(editing.id, list);
    } catch {
      remote = false;
    }
    const patch = { attendances: list, stats };
    try {
      for (const key of ["my-journals", "journals-feed"]) {
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        const i = arr.findIndex((x: any) => x.id === editing.id);
        if (i >= 0) { arr[i] = { ...arr[i], ...patch }; localStorage.setItem(key, JSON.stringify(arr)); }
      }
    } catch {}
    reloadMine(); // arsip lokal tampil seketika; data server menyusul via listener
    setSavingAtt(false);
    setEditing(null);
    toast.success(remote
      ? `Absensi diperbarui (H:${stats.hadir} S:${stats.sakit} I:${stats.izin} A:${stats.alpha}).`
      : "Mode demo — absensi diperbarui lokal.");
  }

  const loading = !ready;
  if (loading) {
    return (
      <Guard roles={["guru"]}>
        <AppShell role="guru" title="Riwayat Jurnal" hint="Jurnal harian — pilih tanggal untuk melihat snapshot hari itu">
          <div className="space-y-2"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>
        </AppShell>
      </Guard>
    );
  }
  if (!rows.length) {
    return (
      <Guard roles={["guru"]}>
        <AppShell role="guru" title="Riwayat Jurnal" hint="Jurnal harian — pilih tanggal untuk melihat snapshot hari itu">
          <DayNav tanggal={tanggal} today={today} onChange={setTanggal} onShift={shiftDay} />
          <Empty
            title={tanggal === today ? "Belum ada jurnal hari ini" : `Tidak ada jurnal ${tanggal.slice(8)}/${tanggal.slice(5, 7)}`}
            hint={tanggal === today
              ? "Wajar bila belum mengisi — buat lewat menu Jurnal Baru."
              : "Hari lalu tampil snapshot hari itu; coba tanggal lain."}
          />
        </AppShell>
      </Guard>
    );
  }
  return (
    <Guard roles={["guru"]}>
      <AppShell role="guru" title="Riwayat Jurnal" hint="Jurnal harian — lengkap dengan foto, materi & TTD">
        <div className="no-print mb-3 flex flex-wrap items-end gap-2">
          <DayNav tanggal={tanggal} today={today} onChange={setTanggal} onShift={shiftDay} />
          <Button variant="outline" className="w-full sm:w-auto" disabled={expBusy} onClick={exportPdf}>
            {expBusy ? <Spinner /> : <Download size={15} />} {expBusy ? `Memproses…${expProg ? ` ${expProg}` : ""}` : "Export PDF"}
          </Button>
        </div>
        <div className="space-y-3">
          {visible.map((j) => {
            const w = jamIsi(dibuat(j));
            return (
            <Card key={j.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-bold">{j.subject} · {j.class}</h2>
                <Badge tone="blue">{j.date}</Badge>
                {w && <Badge tone="slate">Diisi {w}</Badge>}
                <Badge tone={tone(j.teacher_status) as any}>Saya: {j.teacher_status}</Badge>
                <Badge tone="green">H:{j.stats.hadir}</Badge>
                <Badge tone="amber">S:{j.stats.sakit}</Badge>
                <Badge tone="blue">I:{j.stats.izin}</Badge>
                <Badge tone="red">A:{j.stats.alpha}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">{j.material} · oleh {j.teacher}</p>
              <p className="mt-2 text-sm leading-relaxed">{j.notes}</p>
              {j.teacher_status === "izin" && j.leave_note && (
                <p className="mt-2 rounded-xl bg-sky-50 p-2.5 text-sm text-sky-800">Keterangan izin: {j.leave_note}</p>
              )}
              {j.teacher_status === "sakit" && (
                <div className="mt-2 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-800">
                  <p className="flex items-center gap-1.5 font-semibold"><FileText size={14} /> Surat sakit: {j.sick_letter_name || "terlampir"}</p>
                  {j.sick_letter_note && <p className="mt-1">{j.sick_letter_note}</p>}
                </div>
              )}
              <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
                <div className="grid min-w-0 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-xs text-slate-400">
                  {j.photo ? (
                    <button type="button" onClick={() => setZoom({ src: j.photo, label: `Foto — ${j.subject} ${j.class}` })} title="Klik untuk perbesar" className="block w-full min-w-0 overflow-hidden rounded-2xl">
                      <img src={j.photo} alt="bukti" className="aspect-[16/10] max-h-40 w-full cursor-zoom-in object-cover" />
                    </button>
                  ) : (
                    <span className="flex aspect-[16/10] max-h-40 w-full items-center justify-center gap-1.5"><ImageIcon size={14} /> Foto bukti</span>
                  )}
                </div>
                <div className="grid min-w-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-xs text-slate-400">
                  {j.signature ? (
                    <button type="button" onClick={() => setZoom({ src: j.signature, label: `Tanda tangan — ${j.subject} ${j.class}` })} title="Klik untuk perbesar" className="block w-full min-w-0 overflow-hidden rounded-2xl bg-white">
                      <img src={j.signature} alt="ttd" className="h-20 w-full cursor-zoom-in bg-white object-contain" />
                    </button>
                  ) : (
                    <span className="flex h-20 w-full items-center justify-center gap-1.5"><PenLine size={14} /> Tanda tangan</span>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => openEdit(j)}>
                  <Pencil size={15} /> Detail & Ubah Absensi
                </Button>
              </div>
            </Card>
            );
          })}
        </div>
        {zoom && <Lightbox src={zoom.src} label={zoom.label} onClose={() => setZoom(null)} />}
        <Modal open={!!editing} onClose={() => setEditing(null)} title={`Ubah absensi — ${editing?.subject} · ${editing?.class}`}>
          <p className="text-sm text-slate-500">{editing?.date} · hanya absensi siswa yang bisa diubah.</p>
          <div className="relative mt-3">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari nama…"
              aria-label="Cari nama siswa"
              className="w-full min-h-[44px] rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {cari && (
              <button type="button" onClick={() => setCari("")} aria-label="Hapus pencarian" className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X size={15} />
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">{cocok.length} dari {daftar.length} siswa</p>
          <ul className="mt-2 max-h-[50dvh] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {cocok.map((s) => (
              <li key={s.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
                <p className="truncate text-sm font-bold">{s.name} <span className="font-normal text-slate-400">· {s.nisn}</span></p>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {(Object.keys(ATT_LABEL) as AttStatus[]).map((st) => (
                    <label key={st} className={cn("flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-1 text-center text-xs font-bold transition sm:min-h-0",
                      (att[s.id] || "hadir") === st
                        ? st === "hadir" ? "border-emerald-500 bg-emerald-500 text-white" : st === "sakit" ? "border-amber-500 bg-amber-500 text-white" : st === "izin" ? "border-sky-500 bg-sky-500 text-white" : "border-rose-500 bg-rose-500 text-white"
                        : "border-slate-200 bg-white text-slate-500")}>
                      <input type="radio" className="hidden" checked={(att[s.id] || "hadir") === st} onChange={() => setAtt((p) => ({ ...p, [s.id]: st }))} />
                      {ATT_LABEL[st]}
                    </label>
                  ))}
                </div>
              </li>
            ))}
            {editing && daftar.length === 0 && (
              <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">Tidak ada data siswa untuk kelas ini.</p>
            )}
            {editing && daftar.length > 0 && cocok.length === 0 && (
              <p className="rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">Tidak ada siswa yang cocok dengan “{cari.trim()}”.</p>
            )}
          </ul>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={savingAtt} onClick={() => setEditing(null)}>Batal</Button>
            <Button className="flex-1" disabled={savingAtt} onClick={saveAtt}>{savingAtt ? "Menyimpan…" : "Simpan Absensi"}</Button>
          </div>
        </Modal>
      </AppShell>
    </Guard>
  );
}
