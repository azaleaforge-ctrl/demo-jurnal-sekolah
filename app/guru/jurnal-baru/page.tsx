"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import { Camera, ChevronLeft, ChevronRight, Eraser, Check, Loader2, FileUp } from "lucide-react";
import SignatureCanvas from "react-signature-canvas";
import { Guard, useAuth } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Button } from "@/src/components/ui/button";
import { Select, Textarea } from "@/src/components/ui/input";
import { cn } from "@/src/lib/utils";
import { postJournal } from "@/src/lib/api";
import { normalizePhoto, normalizeSignature } from "@/src/lib/media";
import { appendFeed } from "@/src/lib/feed";
import { Lightbox } from "@/src/components/lightbox";
import { useDirectory, getSetting, mockSetting, commitBatch, uploadBlob, uploadFile, uploadPhotoJournal, uploadSignature, uploadSickLetter } from "@/src/lib/db";
import { mulaiOptions, selesaiOptions, compareSlots, rangeLabel } from "@/src/lib/slots";
import { todayID } from "@/src/lib/utils";

type TeacherStatus = "hadir" | "izin" | "sakit";
type Status = "Hadir" | "Sakit" | "Izin" | "Alpha";

// Kontrak §3C + §4: leave_note wajib bila izin; sick_letter wajib bila sakit
const schema = z.object({
  class_id: z.string().min(1, "Pilih kelas"),
  subject_id: z.string().min(1, "Pilih mapel"),
  schedule_id: z.string().min(1, "Pilih jam mulai"),
  schedule_end_id: z.string().optional(),
  material: z.string().min(3, "Isi materi / ATP"),
  notes: z.string().min(5, "Ceritakan kegiatan mengajar (min. 5 karakter)"),
  teacher_status: z.enum(["hadir", "izin", "sakit"]),
  leave_note: z.string().optional(),
  sick_letter_note: z.string().optional(),
  has_sick_letter: z.boolean(),
}).superRefine((v, ctx) => {
  if (v.teacher_status === "izin" && !v.leave_note?.trim()) {
    ctx.addIssue({ code: "custom", path: ["leave_note"], message: "Keterangan izin wajib diisi." });
  }
  if (v.teacher_status === "sakit" && !v.has_sick_letter) {
    ctx.addIssue({ code: "custom", path: ["sick_letter"], message: "Surat klinik/RS wajib diunggah." });
  }
});

const steps = ["Kelas & Mapel", "Jam & Materi", "Foto & TTD", "Absensi"];
const MIN_SIG_B64 = 2500; // ambang Rule anti-kanvas-kosong (§4)

export type SavedJournal = {
  id: string; teacher: string; class: string; subject: string; material: string;
  date: string; notes: string; photo: string; signature: string;
  teacher_status: TeacherStatus; leave_note?: string; sick_letter_name?: string; sick_letter_note?: string;
  stats: { hadir: number; sakit: number; izin: number; alpha: number };
  class_id?: string; subject_id?: string; teacher_id?: string;
  schedule?: string; schedule_id?: string; schedule_end_id?: string;
  attendances?: { student_id: string; status: string }[];
};

export default function JurnalBaru() {
  return (
    <Guard roles={["guru"]}>
      <AppShell role="guru" title="Jurnal Baru" hint="Ikuti 4 langkah — data tersimpan otomatis per langkah">
        <Wizard />
      </AppShell>
    </Guard>
  );
}

function Wizard() {
  const r = useRouter();
  const { user } = useAuth();
  const d = useDirectory();
  const { classes, subjects, schedules, materials, students } = d;
  const [setting, setSetting] = useState(mockSetting());
  useEffect(() => {
    getSetting().then((s) => { if (s) setSetting({ school_name: s.school_name, academic_year: s.academic_year, semester: s.semester, principal_name: s.principal_name }); }).catch(() => {});
  }, []);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherStatus, setTeacherStatus] = useState<TeacherStatus>("hadir");
  const [leaveNote, setLeaveNote] = useState("");
  const [sickFile, setSickFile] = useState<File | null>(null);
  const [sickNote, setSickNote] = useState("");
  const [mulaiId, setMulaiId] = useState("");
  const [endId, setEndId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [customMat, setCustomMat] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string>("");
  const [compressing, setCompressing] = useState(false);
  const [absensi, setAbsensi] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  const [saveStage, setSaveStage] = useState("");
  const [shake, setShake] = useState(0);
  const [sigPreview, setSigPreview] = useState("");
  const [sigLocked, setSigLocked] = useState("");
  const [sigStale, setSigStale] = useState(false);
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);
  const sigRef = useRef<any>(null);

  const siswa = useMemo(() => students.filter((s) => !classId || s.class_id === classId), [classId]);
  const matList = useMemo(() => materials.filter((m) => !subjectId || m.subject_id === subjectId), [subjectId]);
  const material = useManual ? customMat : matList.find((m) => m.id === materialId)?.title || customMat;

  const mapelName = subjects.find((s) => s.id === subjectId)?.name || "—";
  const kelasName = classes.find((c) => c.id === classId)?.name || "—";
  const startDoc = schedules.find((s) => s.id === mulaiId);
  const endDoc = schedules.find((s) => s.id === endId);
  const needEnd = !!startDoc?.kind; // dok lama (tanpa kind) = rentang utuh, end tidak wajib

  // Selesai harus sesudah mulai (order, fallback string time).
  function endAfterStart(): boolean {
    if (!mulaiId || !endId || !needEnd) return true;
    return compareSlots(startDoc, endDoc) < 0;
  }

  function go(n: number) { setDir(n > step ? 1 : -1); setStep(Math.max(0, Math.min(3, n))); }

  function validStep(s: number): boolean {
    if (s === 0) {
      if (!classId || !subjectId) { toast.error("Pilih kelas dan mapel dulu."); return false; }
      if (teacherStatus === "izin" && !leaveNote.trim()) { toast.error("Keterangan izin wajib diisi."); return false; }
      if (teacherStatus === "sakit" && !sickFile) { toast.error("Surat klinik/RS wajib diunggah."); return false; }
    }
    if (s === 1) {
      if (!mulaiId) { toast.error("Pilih jam mulai."); return false; }
      if (needEnd && !endId) { toast.error("Pilih jam selesai."); return false; }
      if (mulaiId && endId && needEnd && !endAfterStart()) { toast.error("Jam selesai harus sesudah jam mulai."); return false; }
      if (material.trim().length < 3) { toast.error("Isi materi / ATP."); return false; }
    }
    if (s === 2 && notes.trim().length < 5) { toast.error("Isi catatan kegiatan mengajar."); return false; }
    return true;
  }
  function next() { if (validStep(step)) go(step + 1); }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setCompressing(true);
    try {
      const imageCompression = (await import("browser-image-compression")).default;
      const out = await imageCompression(f, { maxSizeMB: 0.3, maxWidthOrHeight: 1024, useWebWorker: true });
      const raw = await imageCompression.getDataUrlFromFile(out);
      setPhoto(await normalizePhoto(raw));
      toast.success("Foto ditambahkan & dikompresi.");
    } catch {
      const url = URL.createObjectURL(f);
      setPhoto(url);
      toast.success("Foto ditambahkan.");
    } finally {
      setCompressing(false);
    }
  }

  function onSickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.(pdf|jpg|jpeg|png)$/i.test(f.name)) { toast.error("Surat harus pdf/jpg/png."); return; }
    if (f.size > 2 * 1024 * 1024) { toast.error("Ukuran surat maksimal 2 MB."); return; }
    setSickFile(f);
    toast.success("Surat sakit dilampirkan.");
  }

  function sigFail() {
    setShake((x) => x + 1);
    toast.error("Tanda tangan digital wajib diisi!");
  }

  // Kunci TTD ke state via tombol eksplisit — kanvas live di-unmount saat
  // pindah langkah, jadi submit TIDAK BOLEH baca dari ref.
  function lockSig() {
    const sig = sigRef.current;
    if (!sig || sig.isEmpty()) { sigFail(); return; }
    let data = "";
    try {
      data = normalizeSignature(sig.getTrimmedCanvas());
    } catch { sigFail(); return; }
    if ((data.split(",")[1] || "").length < MIN_SIG_B64) { sigFail(); return; }
    setSigLocked(data);
    setSigPreview(data);
    setSigStale(false);
    toast.success("Tanda tangan tersimpan.");
  }

  function clearSig() {
    sigRef.current?.clear();
    setSigPreview("");
    setSigLocked("");
    setSigStale(false);
  }

  async function save() {
    const parsed = schema.safeParse({
      class_id: classId, subject_id: subjectId, schedule_id: mulaiId, schedule_end_id: endId || undefined,
      material, notes, teacher_status: teacherStatus,
      leave_note: leaveNote, sick_letter_note: sickNote, has_sick_letter: !!sickFile,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      toast.error(issue?.message || "Lengkapi jurnal.");
      const p = String(issue?.path[0] || "");
      go(p === "leave_note" || p === "sick_letter" ? 0 : p === "notes" ? 2 : 0);
      return;
    }
    if (needEnd && !endId) { toast.error("Pilih jam selesai."); go(1); return; }
    if (mulaiId && endId && needEnd && !endAfterStart()) { toast.error("Jam selesai harus sesudah jam mulai."); go(1); return; }
    if (!photo) { toast.error("Foto bukti mengajar wajib diambil."); go(2); return; }
    // TTD dipakai dari hasil tombol "Simpan TTD" (state), bukan kanvas live —
    // kanvas di-unmount saat pindah ke langkah 4 sehingga ref pasti null di sini.
    if (!sigLocked) { sigFail(); go(2); return; }
    const signature_data = sigLocked;

    setSaving(true);
    setSaveStage("Menyiapkan…");
    try {
      const fd = new FormData();
      fd.append("class_id", classId);
      fd.append("subject_id", subjectId);
      fd.append("schedule_id", mulaiId);
      if (needEnd && endId) fd.append("schedule_end_id", endId);
      fd.append("date", todayID());
      fd.append("semester", setting.semester.toLowerCase());
      if (!useManual && materialId) fd.append("material_id", materialId);
      else fd.append("custom_material", material);
      fd.append("notes", notes);
      fd.append("photo", await (await fetch(photo)).blob(), "foto.jpg");
      fd.append("signature_data", signature_data);
      fd.append("teacher_status", teacherStatus);
      if (teacherStatus === "izin") fd.append("leave_note", leaveNote.trim());
      if (teacherStatus === "sakit" && sickFile) {
        fd.append("sick_letter", sickFile);
        if (sickNote.trim()) fd.append("sick_letter_note", sickNote.trim());
      }
      const attList = siswa.map((s) => ({ student_id: s.id, status: (absensi[s.id] || "Hadir").toLowerCase() }));
      fd.append("attendances", JSON.stringify(attList));

      // Tulis Firestore (§5): upload media PARALEL → 1 writeBatch (journal + attendances, atomik).
      // Tiap upload bawa fallback sendiri (UploadThing → Firebase → dataURL + toast).
      async function persistJournal(): Promise<{ jid: string; photo_url: string; signature_url: string }> {
        const date = todayID();
        const jid = `jr${Date.now()}`;
        setSaveStage("Mengunggah foto…");
        const [photoBlob, sigBlob] = await Promise.all([
          (await fetch(photo)).blob(),
          (await fetch(signature_data)).blob(),
        ]);
        const upPhoto = (async () => {
          try {
            return await uploadPhotoJournal(photoBlob);
          } catch {
            try {
              return await uploadBlob(`jurnal/${date}/${jid}.jpg`, photoBlob, "image/jpeg");
            } catch { toast.info("Upload foto gagal — arsip memakai salinan lokal."); return photo; }
          }
        })();
        const upSig = (async () => {
          try {
            return await uploadSignature(signature_data);
          } catch {
            try {
              return await uploadBlob(`ttd/${date}/${jid}.png`, sigBlob, "image/png");
            } catch { toast.info("Upload TTD gagal — arsip memakai salinan lokal."); return signature_data; }
          }
        })();
        const upSick = (async (): Promise<string | null> => {
          if (!(teacherStatus === "sakit" && sickFile)) return null;
          const ext = (sickFile.name.split(".").pop() || "pdf").toLowerCase();
          try {
            return await uploadSickLetter(sickFile);
          } catch {
            try {
              return await uploadFile(`surat-sakit/${user?.id || "guru"}_${date}_${Date.now()}.${ext}`, sickFile);
            } catch { toast.info("Upload surat gagal — nama file dicatat di arsip."); return null; }
          }
        })();
        const [photo_url, signature_url, sick_letter_url] = await Promise.all([upPhoto, upSig, upSick]);
        setSaveStage("Menyimpan…");
        await commitBatch([
          {
            col: "journals", id: jid,
            data: {
              teacher_id: user?.id || "", class_id: classId, subject_id: subjectId, schedule_id: mulaiId,
              schedule_end_id: needEnd && endId ? endId : null,
              material_id: (!useManual && materialId) || null,
              custom_material: (useManual || !materialId) ? material : null,
              notes, photo_url, signature_url, teacher_status: teacherStatus,
              leave_note: teacherStatus === "izin" ? leaveNote.trim() : null,
              sick_letter_url, sick_letter_note: teacherStatus === "sakit" && sickNote.trim() ? sickNote.trim() : null,
              date, semester: setting.semester.toLowerCase(),
            },
          },
          ...attList.map((a) => ({ col: "student_attendances", data: { journal_id: jid, student_id: a.student_id, status: a.status } })),
        ]);
        return { jid, photo_url, signature_url };
      }

      let mode: "laravel" | "firestore" | "demo" = "demo";
      let jid = `jr${Date.now()}`;
      let photoFinal = photo;
      let sigFinal = signature_data;
      try {
        await postJournal(fd);
        mode = "laravel";
      } catch {
        try {
          const saved = await persistJournal();
          jid = saved.jid;
          photoFinal = saved.photo_url;
          sigFinal = saved.signature_url;
          mode = "firestore";
        } catch {
          mode = "demo";
        }
      }

      // Arsip lokal agar riwayat langsung menampilkan status guru
      const stats = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
      siswa.forEach((s) => { stats[(absensi[s.id] || "Hadir").toLowerCase() as keyof typeof stats]++; });
      const entry: SavedJournal = {
        id: jid, teacher: user?.name || "Saya", class: kelasName, subject: mapelName,
        material, date: todayID(), notes, photo: photoFinal, signature: sigFinal,
        teacher_status: teacherStatus,
        leave_note: teacherStatus === "izin" ? leaveNote.trim() : undefined,
        sick_letter_name: teacherStatus === "sakit" ? sickFile?.name : undefined,
        sick_letter_note: teacherStatus === "sakit" && sickNote.trim() ? sickNote.trim() : undefined,
        stats,
        class_id: classId, subject_id: subjectId, teacher_id: user?.id,
        schedule: rangeLabel(schedules, mulaiId, needEnd ? endId : undefined), schedule_id: mulaiId,
        schedule_end_id: needEnd && endId ? endId : undefined,
        attendances: attList,
      };
      try {
        const prev = JSON.parse(localStorage.getItem("my-journals") || "[]");
        localStorage.setItem("my-journals", JSON.stringify([entry, ...prev]));
      } catch {}
      appendFeed(entry);
      toast.success(mode === "demo" ? "Mode demo — jurnal tersimpan lokal." : "Jurnal & absensi tersimpan.");
      r.push("/guru/riwayat");
    } finally {
      setSaving(false);
      setSaveStage("");
    }
  }

  const statusSeg: { v: TeacherStatus; label: string }[] = [
    { v: "hadir", label: "Hadir" }, { v: "izin", label: "Izin" }, { v: "sakit", label: "Sakit" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div>
        <ol className="flex gap-1.5">
          {steps.map((s, i) => (
            <li key={s} className="flex-1">
              <div className={cn("h-1.5 rounded-full transition", i <= step ? "bg-brand-500" : "bg-slate-200")} />
              <p className={cn("mt-1.5 hidden text-[11px] font-semibold sm:block", i === step ? "text-brand-600" : "text-slate-400")}>{i + 1}. {s}</p>
            </li>
          ))}
        </ol>

        <div className="relative mt-4 min-h-[380px] overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-soft sm:p-6">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.div key={step} custom={dir}
              initial={{ x: 80 * dir, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -80 * dir, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}>

              {step === 0 && (
                <div className="space-y-4">
                  <h2 className="font-display text-lg font-bold">Kelas & mapel apa hari ini?</h2>
                  <Select label="Kelas" value={classId} onChange={(e) => setClassId(e.target.value)}>
                    <option value="">Pilih kelas</option>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Select label="Mata pelajaran" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                    <option value="">Pilih mapel</option>
                    {subjects.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                  </Select>
                  <div>
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">Status kehadiran saya sesi ini</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {statusSeg.map((s) => (
                        <button key={s.v} type="button" onClick={() => setTeacherStatus(s.v)}
                          className={cn("min-h-[44px] rounded-xl border py-2.5 text-sm font-bold transition sm:min-h-0",
                            teacherStatus === s.v
                              ? s.v === "hadir" ? "border-emerald-500 bg-emerald-500 text-white" : s.v === "izin" ? "border-sky-500 bg-sky-500 text-white" : "border-amber-500 bg-amber-500 text-white"
                              : "border-slate-200 bg-white text-slate-500")}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {teacherStatus === "izin" && (
                    <Textarea label="Keterangan izin *" rows={2} value={leaveNote} onChange={(e) => setLeaveNote(e.target.value)} placeholder="Mis. Ada keperluan keluarga mendadak…" />
                  )}
                  {teacherStatus === "sakit" && (
                    <div className="space-y-3 rounded-2xl bg-amber-50/70 p-3.5">
                      <div>
                        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Surat klinik/RS (pdf/jpg/png, maks 2 MB) *</span>
                        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white sm:min-h-0">
                          <FileUp size={16} /> {sickFile ? "Ganti surat" : "Unggah surat"}
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={onSickFile} />
                        </label>
                        {sickFile && <p className="mt-1.5 text-xs font-semibold text-emerald-600">✓ {sickFile.name}</p>}
                      </div>
                      <Textarea label="Keterangan surat (dianjurkan)" rows={2} value={sickNote} onChange={(e) => setSickNote(e.target.value)} placeholder="Mis. Istirahat 2 hari sesuai surat dokter…" />
                    </div>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <h2 className="font-display text-lg font-bold">Jam mengajar (slot guru)</h2>
                  <p className="-mt-2 text-xs text-slate-500">Jam ini slot/shift mengajar guru — absensi siswa selalu seluruh kelas yang dipilih.</p>
                  <Select label="Jam Mulai" value={mulaiId} onChange={(e) => { setMulaiId(e.target.value); setEndId(""); }}>
                    <option value="">Pilih jam mulai</option>
                    {mulaiOptions(schedules).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </Select>
                  {(!startDoc || startDoc.kind) && (
                    <Select label="Jam Selesai" value={endId} onChange={(e) => setEndId(e.target.value)}>
                      <option value="">Pilih jam selesai</option>
                      {selesaiOptions(schedules).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </Select>
                  )}
                  {!useManual ? (
                    <Select label="ATP / Materi" value={materialId} onChange={(e) => setMaterialId(e.target.value)}>
                      <option value="">Pilih materi</option>
                      {matList.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </Select>
                  ) : (
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">Materi manual</label>
                      <input value={customMat} onChange={(e) => setCustomMat(e.target.value)} placeholder="Tulis materi…" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
                    </div>
                  )}
                  <button onClick={() => setUseManual(!useManual)} className="text-sm font-semibold text-brand-600 hover:underline">
                    {useManual ? "← pilih dari daftar materi" : "Materi tidak terdaftar? isi manual →"}
                  </button>
                  {!useManual && (
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold text-slate-700">Atau lengkapi manual</label>
                      <input value={customMat} onChange={(e) => setCustomMat(e.target.value)} placeholder="Opsional…" className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500" />
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <h2 className="font-display text-lg font-bold">Catatan, foto & tanda tangan</h2>
                  <Textarea label="Catatan kegiatan mengajar" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mis. Membahas flexbox + praktik 30 menit…" />
                  <div>
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">Foto bukti mengajar *</span>
                    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white sm:min-h-0">
                      <Camera size={16} /> {compressing ? "Memadatkan…" : photo ? "Ganti foto" : "Ambil foto"}
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
                    </label>
                    {photo && (
                      <button type="button" onClick={() => setZoom({ src: photo, label: "Foto bukti mengajar" })} title="Klik untuk perbesar" className="mt-2 block w-full min-w-0 overflow-hidden rounded-xl">
                        <img src={photo} alt="Bukti" className="aspect-[16/10] max-h-40 w-full cursor-zoom-in object-cover" />
                      </button>
                    )}
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">Tanda tangan digital *</span>
                      <button onClick={clearSig} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600"><Eraser size={13} /> Clear</button>
                    </div>
                    <div key={shake} className={cn("overflow-hidden rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60", shake > 0 && "animate-shake border-rose-400")}>
                      <SignatureCanvas
                        ref={sigRef} canvasProps={{ className: "h-40 w-full touch-none" }} penColor="#101828"
                        onBegin={() => { if (sigLocked) setSigStale(true); }}
                        onEnd={() => {
                          try { setSigPreview(normalizeSignature(sigRef.current?.getTrimmedCanvas())); } catch {}
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={lockSig} className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 sm:min-h-0">
                        <Check size={15} /> Simpan Tanda Tangan
                      </button>
                      {sigLocked && !sigStale && <span className="text-xs font-bold text-emerald-600">Tersimpan ✓</span>}
                      {sigStale && <span className="text-xs font-bold text-amber-600">Berubah — simpan ulang</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Tanda tangani di kotak dengan jari / mouse.</p>
                    {sigPreview && (
                      <button type="button" onClick={() => setZoom({ src: sigPreview, label: "Tanda tangan digital" })} title="Klik untuk perbesar" className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-slate-100 bg-white p-2 text-left">
                        <img src={sigPreview} alt="Pratinjau TTD" className="h-16 min-w-0 flex-1 cursor-zoom-in rounded-lg bg-slate-50 object-contain" />
                        <span className="shrink-0 text-xs font-semibold text-emerald-600">Live preview ✓</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h2 className="font-display text-lg font-bold">Absensi siswa — {kelasName}</h2>
                  <p className="text-sm text-slate-500">Hadir terpilih otomatis. Ubah yang sakit / izin / alpha.</p>
                  <ul className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                    {(siswa.length ? siswa : [{ id: "d1", name: "Belum ada siswa di kelas ini", nisn: "-" }]).map((s: any) => (
                      <li key={s.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
                        <p className="text-sm font-bold">{s.name} <span className="font-normal text-slate-400">· {s.nisn}</span></p>
                        <div className="mt-2 grid grid-cols-4 gap-1.5">
                          {(["Hadir", "Sakit", "Izin", "Alpha"] as Status[]).map((st) => (
                            <label key={st} className={cn("flex min-h-[44px] cursor-pointer items-center justify-center rounded-lg border px-1 py-1.5 text-center text-xs font-bold transition sm:min-h-0",
                              (absensi[s.id] || "Hadir") === st
                                ? st === "Hadir" ? "border-emerald-500 bg-emerald-500 text-white" : st === "Sakit" ? "border-amber-500 bg-amber-500 text-white" : st === "Izin" ? "border-sky-500 bg-sky-500 text-white" : "border-rose-500 bg-rose-500 text-white"
                                : "border-slate-200 bg-white text-slate-500")}>
                              <input type="radio" className="hidden" checked={(absensi[s.id] || "Hadir") === st} onChange={() => setAbsensi((p) => ({ ...p, [s.id]: st }))} />
                              {st}
                            </label>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex gap-2 pb-2">
          <Button variant="outline" className="flex-1" disabled={step === 0} onClick={() => go(step - 1)}><ChevronLeft size={16} /> Kembali</Button>
          {step < 3
            ? <Button className="flex-[2]" onClick={next}>Lanjut <ChevronRight size={16} /></Button>
            : <Button className="flex-[2]" disabled={saving} onClick={save}>{saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {saving ? (saveStage || "Menyimpan…") : "Simpan Jurnal"}</Button>}
        </div>
      </div>

      {/* Live preview — tampil di tablet/desktop */}
      <aside className="hidden h-fit rounded-3xl bg-ink p-5 text-white lg:block">
        <p className="text-xs font-bold uppercase tracking-widest text-white/50">Live preview</p>
        <p className="font-display mt-1 text-lg font-bold">{mapelName}</p>
        <p className="text-sm text-white/60">{kelasName} · {rangeLabel(schedules, mulaiId, needEnd ? endId : undefined) || "Jam belum dipilih"}</p>
        <p className="mt-1 text-xs font-bold capitalize text-accent-400">Saya: {teacherStatus}</p>
        <div className="mt-3 rounded-2xl bg-white/10 p-3 text-sm">
          <p className="font-bold text-accent-400">Materi</p>
          <p className="text-white/85">{material || "—"}</p>
        </div>
        <div className="mt-2 rounded-2xl bg-white/10 p-3 text-sm">
          <p className="font-bold text-accent-400">Catatan</p>
          <p className="line-clamp-4 text-white/85">{notes || "—"}</p>
        </div>
        {photo && (
          <div className="mt-2 min-w-0 overflow-hidden rounded-2xl">
            <img src={photo} alt="preview" className="aspect-[16/10] max-h-40 w-full object-cover" />
          </div>
        )}
        {sigPreview && (
          <div className="mt-2 h-16 min-w-0 overflow-hidden rounded-2xl bg-white">
            <img src={sigPreview} alt="preview TTD" className="h-16 w-full object-contain" />
          </div>
        )}
        <p className="mt-3 text-xs text-white/50">Langkah {step + 1} dari 4 · {steps[step]}</p>
      </aside>
      {zoom && <Lightbox src={zoom.src} label={zoom.label} onClose={() => setZoom(null)} />}
    </div>
  );
}
