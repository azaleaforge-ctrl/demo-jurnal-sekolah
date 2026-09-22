"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { listDocs, useDirectory, getSetting, mockSetting, rewriteAttendances } from "@/src/lib/db";
import { downloadRekap, type ExportDir } from "@/src/lib/export";
import { byNewest, type FeedEntry } from "@/src/lib/feed";
import { slotLabel, rangeLabel } from "@/src/lib/slots";
import { cn, byName } from "@/src/lib/utils";
import type { SavedJournal } from "../jurnal-baru/page";

type Row = Omit<SavedJournal, "teacher"> & { teacher: string };
type AttStatus = "hadir" | "sakit" | "izin" | "alpha";

const tone = (s: string) => (s === "hadir" ? "green" : s === "izin" ? "blue" : "amber");
const ATT_LABEL: Record<AttStatus, string> = { hadir: "Hadir", sakit: "Sakit", izin: "Izin", alpha: "Alpha" };

export default function RiwayatPage() {
  const { user } = useAuth();
  const dir = useDirectory();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);
  const [bulan, setBulan] = useState("");
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
  // Lingkup tampil default bulan berjalan + "Muat lagi" mundur per bulan.
  const [since, setSince] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const visible = useMemo(() => rows.filter((r) => !r.date || r.date >= since), [rows, since]);
  function muatLama() {
    const [y, m] = since.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    setSince(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  }

  const xdir: ExportDir = useMemo(() => ({
    school: { name: sch.school_name, academicYear: sch.academic_year, semester: sch.semester.toLowerCase() === "genap" ? "Genap" : "Ganjil", principalName: (sch as any).principal_name },
    students: dir.students.map((s) => ({ id: s.id, nisn: s.nisn, name: s.name, class_id: s.class_id })),
    classes: dir.classes.map((c) => ({ id: c.id, name: c.name, wali: (c as any).wali })),
    teachers: dir.users.filter((u) => u.role === "guru").map((t) => ({ id: t.id, name: t.name })),
  }), [dir, sch]);

  useEffect(() => {
    getSetting()
      .then((s) => { if (s) setSch({ school_name: s.school_name, academic_year: s.academic_year, semester: s.semester.toLowerCase() === "genap" ? "Genap" : "Ganjil", principal_name: s.principal_name }); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (dir.loading) return;
    (async () => {
      let mine: Row[] = [];
      try {
        mine = JSON.parse(localStorage.getItem("my-journals") || "[]");
      } catch {}
      const seen = new Set(mine.map((m) => m.id));
      const clsName = (id?: string) => dir.classes.find((c) => c.id === id)?.name || "";
      const subName = (id?: string) => dir.subjects.find((s) => s.id === id)?.name || "";
      const schName = (id?: string, endId?: string) => rangeLabel(dir.schedules, id, endId) || slotLabel(dir.schedules, id) || "";
      const matTitle = (id?: string) => dir.materials.find((m) => m.id === id)?.title || "";
      const lbl = (...vals: (string | undefined | null)[]) => {
        for (const v of vals) {
          const s = String(v ?? "").trim();
          if (s && s !== "-") return s;
        }
        return "-";
      };
      try {
        // Riwayat pribadi: journals where teacher_id = saya
        const js = user?.id
          ? await listDocs("journals", { wheres: [["teacher_id", "==", user.id]] })
          : [];
        const remote: Row[] = js
          .filter((j) => !seen.has(j.id))
          .map((j) => {
            const stats = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
            (j.attendances || []).forEach((a: any) => {
              const k = String(a.status || "").toLowerCase() as keyof typeof stats;
              if (k in stats) stats[k]++;
            });
            return {
              id: j.id, teacher: user?.name || "Saya",
              class: lbl(j.class_name, j.class, clsName(j.class_id)),
              subject: lbl(j.subject_name, j.subject, subName(j.subject_id)),
              material: j.material_text || j.material || j.custom_material || "",
              date: j.date || "",
              notes: j.notes || "", photo: j.photo_url || "", signature: j.signature_url || "",
              teacher_status: j.teacher_status || "hadir",
              leave_note: j.leave_note, sick_letter_name: j.sick_letter_url ? String(j.sick_letter_url).split("/").pop() : undefined,
              sick_letter_note: j.sick_letter_note, stats,
              class_id: j.class_id, subject_id: j.subject_id, teacher_id: j.teacher_id,
              schedule: lbl(j.schedule_label, j.schedule, schName(j.schedule_id, j.schedule_end_id)) || undefined,
              schedule_id: j.schedule_id, schedule_end_id: j.schedule_end_id, attendances: j.attendances,
            } as Row;
          });
        const fallback = mine.length || remote.length ? [] : journals.map((j) => ({
          ...j, teacher_status: "hadir" as const, leave_note: undefined,
          sick_letter_name: undefined, sick_letter_note: undefined,
        }));
        setRows([...mine, ...remote, ...fallback].sort(byNewest));
      } catch {
        const fallback = mine.length ? [] : journals.map((j) => ({
          ...j, teacher_status: "hadir" as const, leave_note: undefined,
          sick_letter_name: undefined, sick_letter_note: undefined,
        }));
        setRows([...mine, ...fallback].sort(byNewest));
        if (!toastRef.current) { toastRef.current = true; toast.info("Mode demo — memakai data lokal."); }
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, user?.name, dir.loading]);

  // Export PDF benaran (template formal identik admin), ter-filter guru pemilik.
  async function exportPdf() {
    if (!user?.id) return toast.error("Masuk terlebih dahulu.");
    if (expBusy) return;
    setExpBusy(true);
    setExpProg("");
    try {
      const ymd = (b: string) => { const [y, m] = b.split("-").map(Number); return new Date(y, m, 0).getDate(); };
      const mode = await downloadRekap({
        tipe: "guru", format: "pdf",
        dari: bulan ? `${bulan}-01` : "", sampai: bulan ? `${bulan}-${ymd(bulan)}` : "",
        teacherId: user.id, feed: rows as unknown as FeedEntry[], dir: xdir,
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
    const stats = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
    list.forEach((a) => { stats[a.status as keyof typeof stats]++; });
    let remote = true;
    try {
      await rewriteAttendances(editing.id, list);
    } catch {
      remote = false;
    }
    const patch = { attendances: list, stats };
    setRows((p) => p.map((r) => (r.id === editing.id ? { ...r, ...patch } : r)));
    try {
      for (const key of ["my-journals", "journals-feed"]) {
        const arr = JSON.parse(localStorage.getItem(key) || "[]");
        const i = arr.findIndex((x: any) => x.id === editing.id);
        if (i >= 0) { arr[i] = { ...arr[i], ...patch }; localStorage.setItem(key, JSON.stringify(arr)); }
      }
    } catch {}
    setSavingAtt(false);
    setEditing(null);
    toast.success(remote
      ? `Absensi diperbarui (H:${stats.hadir} S:${stats.sakit} I:${stats.izin} A:${stats.alpha}).`
      : "Mode demo — absensi diperbarui lokal.");
  }

  if (loading) {
    return (
      <Guard roles={["guru"]}>
        <AppShell role="guru" title="Riwayat Jurnal" hint="Semua jurnal yang pernah tersimpan">
          <div className="space-y-2"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>
        </AppShell>
      </Guard>
    );
  }
  if (!rows.length) {
    return (
      <Guard roles={["guru"]}>
        <AppShell role="guru" title="Riwayat Jurnal" hint="Semua jurnal yang pernah tersimpan">
          <Empty title="Belum ada jurnal" hint="Isi jurnal pertama lewat menu Jurnal Baru." />
        </AppShell>
      </Guard>
    );
  }
  return (
    <Guard roles={["guru"]}>
      <AppShell role="guru" title="Riwayat Jurnal" hint="Lengkap dengan foto, materi & TTD">
        <div className="no-print mb-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm font-semibold text-slate-700 sm:max-w-[220px] sm:flex-none">Bulan
            <input type="month" value={bulan} onChange={(e) => setBulan(e.target.value)} className="mt-1.5 block w-full max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal" />
          </label>
          <Button variant="outline" className="w-full sm:w-auto" disabled={expBusy} onClick={exportPdf}>
            {expBusy ? <Spinner /> : <Download size={15} />} {expBusy ? `Memproses…${expProg ? ` ${expProg}` : ""}` : "Export PDF"}
          </Button>
        </div>
        <div className="space-y-3">
          {visible.map((j) => (
            <Card key={j.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-bold">{j.subject} · {j.class}</h2>
                <Badge tone="blue">{j.date}</Badge>
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
          ))}
        </div>
        {visible.length < rows.length && (
          <Button variant="outline" className="mt-3 w-full" onClick={muatLama}>
            Muat jurnal lebih lama ({rows.length - visible.length} disembunyikan)
          </Button>
        )}
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
