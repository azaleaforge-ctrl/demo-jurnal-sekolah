import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { API_BASE, endpoints } from "./api";
import { school as fbSchool, students as fbStudents, classes as fbClasses, teachers as fbTeachers } from "./mock";
import type { FeedEntry } from "./feed";

// Rekap nyata dari feed lokal; backend GET /export/* dicoba dulu, gagal → lokal.

export type RekapTipe = "guru" | "siswa";
export type ExportDir = {
  school: { name: string; academicYear: string; semester: string };
  students: { id: string; nisn: string; name: string; class_id: string }[];
  classes: { id: string; name: string }[];
  teachers: { id: string; name: string }[];
};
const defaultDir: ExportDir = { school: fbSchool, students: fbStudents, classes: fbClasses, teachers: fbTeachers };

export type RekapOpts = {
  tipe: RekapTipe;
  dari: string; // YYYY-MM-DD, "" = tanpa batas
  sampai: string;
  classId?: string;
  teacherId?: string;
  feed: FeedEntry[];
  dir?: ExportDir;
};

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export function fmtID(iso: string) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso || "-";
  return `${d} ${BULAN[m - 1]} ${y}`;
}
export function periodeLabel(dari: string, sampai: string) {
  if (dari && sampai) return dari === sampai ? fmtID(dari) : `${fmtID(dari)} – ${fmtID(sampai)}`;
  return "Semua periode";
}
export function rekapFilename(tipe: RekapTipe, format: "pdf" | "xlsx", dari: string, sampai: string) {
  const p = dari && sampai ? (dari === sampai ? dari : `${dari}_sd_${sampai}`) : "semua-periode";
  return `Rekap-${tipe === "guru" ? "Guru" : "Siswa"}-${p}.${format}`;
}

export function filterRekap(feed: FeedEntry[], dari: string, sampai: string, classId?: string, teacherId?: string, dir: ExportDir = defaultDir) {
  const cls = classId ? dir.classes.find((c) => c.id === classId) : undefined;
  const tch = teacherId ? dir.teachers.find((t) => t.id === teacherId) : undefined;
  return feed
    .filter((f) => (!dari || f.date >= dari) && (!sampai || f.date <= sampai))
    .filter((f) => !classId || f.class_id === classId || (!!cls && f.class === cls.name))
    .filter((f) => !teacherId || (f as any).teacher_id === teacherId || (!!tch && f.teacher === tch.name))
    .sort((a, b) => a.date.localeCompare(b.date));
}

const statusID = (s: string) => (s === "izin" ? "Izin" : s === "sakit" ? "Sakit" : "Hadir");
export function keterangan(j: FeedEntry) {
  if (j.teacher_status === "izin") return j.leave_note || "-";
  if (j.teacher_status === "sakit") return j.sick_letter_note || j.sick_letter_name || "-";
  return "-";
}
export function studentOf(id: string, students: ExportDir["students"] = defaultDir.students) {
  return students.find((s) => s.id === id);
}

// ---------- Excel (exceljs, berstyled) ----------

const BLUE = "FF2E5BFF";
const LINE = "FFD0D5DD";
const thin = { style: "thin" as const, color: { argb: LINE } };
const allBorder = { top: thin, left: thin, bottom: thin, right: thin };

function kop(ws: ExcelJS.Worksheet, title: string, periode: string, nCols: number, sch: ExportDir["school"]) {
  const last = String.fromCharCode(64 + nCols);
  ws.mergeCells(`A1:${last}1`);
  ws.mergeCells(`A2:${last}2`);
  ws.mergeCells(`A3:${last}3`);
  const r1 = ws.getRow(1);
  r1.getCell(1).value = sch.name;
  r1.font = { bold: true, size: 14 };
  r1.alignment = { horizontal: "center" };
  const r2 = ws.getRow(2);
  r2.getCell(1).value = `Tahun Ajaran ${sch.academicYear} · Semester ${sch.semester}`;
  r2.font = { italic: true, size: 11 };
  r2.alignment = { horizontal: "center" };
  const r3 = ws.getRow(3);
  r3.getCell(1).value = `${title} · Periode ${periode}`;
  r3.font = { bold: true, size: 12 };
  r3.alignment = { horizontal: "center" };
}

function headerRow(ws: ExcelJS.Worksheet, n: number, heads: string[]) {
  const row = ws.getRow(n);
  heads.forEach((h, i) => {
    const c = row.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = allBorder;
  });
  row.height = 22;
}

function bodyRow(ws: ExcelJS.Worksheet, n: number, vals: (string | number)[], bold = false) {
  const row = ws.getRow(n);
  vals.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v;
    if (bold) c.font = { bold: true };
    c.border = allBorder;
    c.alignment = { vertical: "middle", wrapText: true };
  });
}

export async function buildRekapExcel(o: RekapOpts & { rows: FeedEntry[] }): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const periode = periodeLabel(o.dari, o.sampai);
  const dir = o.dir ?? defaultDir;
  const sch = dir.school;
  if (o.tipe === "guru") {
    const ws = wb.addWorksheet("Rekap Guru");
    ws.columns = [{ width: 4 }, { width: 14 }, { width: 22 }, { width: 20 }, { width: 14 }, { width: 20 }, { width: 30 }, { width: 10 }, { width: 30 }];
    kop(ws, "Rekap Kehadiran Guru", periode, 9, sch);
    headerRow(ws, 4, ["No", "Tanggal", "Guru", "Mapel", "Kelas", "Jam (slot guru)", "Materi", "Status", "Keterangan"]);
    o.rows.forEach((j, i) => {
      bodyRow(ws, 5 + i, [i + 1, fmtID(j.date), j.teacher, j.subject, j.class, j.schedule || "-", j.material || "-", statusID(j.teacher_status), keterangan(j)]);
    });
    const t = { hadir: 0, izin: 0, sakit: 0 };
    o.rows.forEach((j) => { t[j.teacher_status]++; });
    const tr = 5 + o.rows.length;
    ws.mergeCells(`A${tr}:G${tr}`);
    bodyRow(ws, tr, [`TOTAL (${o.rows.length} jurnal)`, "", "", "", "", "", "", `Hadir: ${t.hadir}`, `Izin: ${t.izin} · Sakit: ${t.sakit}`], true);
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: "A4", to: "I4" };
  } else {
    const ws = wb.addWorksheet("Rekap Siswa");
    ws.columns = [{ width: 4 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 24 }, { width: 6 }, { width: 6 }, { width: 6 }, { width: 6 }];
    kop(ws, "Rekap Kehadiran Siswa", periode, 9, sch);
    let r = 4;
    // (a) detail per siswa per jurnal — hanya jurnal yang menyimpan rincian absensi
    headerRow(ws, r, ["No", "Tanggal", "Kelas", "NISN", "Nama", "H", "S", "I", "A"]);
    ws.views = [{ state: "frozen", ySplit: r }];
    ws.autoFilter = { from: `A${r}`, to: `I${r}` };
    r++;
    let no = 1;
    const agg = new Map<string, { nisn: string; name: string; class: string; h: number; s: number; i: number; a: number }>();
    o.rows.forEach((j) => {
      (j.attendances || []).forEach((at) => {
        const st = studentOf(at.student_id, dir.students);
        const k = st?.id || at.student_id;
        if (!agg.has(k)) agg.set(k, { nisn: st?.nisn || "-", name: st?.name || at.student_id, class: j.class, h: 0, s: 0, i: 0, a: 0 });
        const g = agg.get(k)!;
        if (at.status === "hadir") g.h++; else if (at.status === "sakit") g.s++; else if (at.status === "izin") g.i++; else g.a++;
        bodyRow(ws, r++, [no++, fmtID(j.date), j.class, g.nisn, g.name, at.status === "hadir" ? "✓" : "", at.status === "sakit" ? "✓" : "", at.status === "izin" ? "✓" : "", at.status === "alpha" ? "✓" : ""]);
      });
    });
    // (b) rekap agregat per siswa
    r++;
    ws.mergeCells(`A${r}:I${r}`);
    bodyRow(ws, r++, ["REKAP PER SISWA", "", "", "", "", "", "", "", ""], true);
    headerRow(ws, r, ["No", "NISN", "Nama", "Kelas", "H", "S", "I", "A", "%Hadir"]);
    r++;
    let n = 1;
    [...agg.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach((g) => {
      const tot = g.h + g.s + g.i + g.a;
      bodyRow(ws, r++, [n++, g.nisn, g.name, g.class, g.h, g.s, g.i, g.a, tot ? `${Math.round((g.h / tot) * 100)}%` : "-"]);
    });
    // (c) rekap per jurnal — mencakup semua jurnal termasuk tanpa rincian
    r++;
    ws.mergeCells(`A${r}:I${r}`);
    bodyRow(ws, r++, ["REKAP PER JURNAL (AGREGAT)", "", "", "", "", "", "", "", ""], true);
    headerRow(ws, r, ["No", "Tanggal", "Kelas", "Guru", "H", "S", "I", "A", "Total"]);
    r++;
    const tot = { h: 0, s: 0, i: 0, a: 0 };
    o.rows.forEach((j, i) => {
      const t = j.stats.hadir + j.stats.sakit + j.stats.izin + j.stats.alpha;
      tot.h += j.stats.hadir; tot.s += j.stats.sakit; tot.i += j.stats.izin; tot.a += j.stats.alpha;
      bodyRow(ws, r++, [i + 1, fmtID(j.date), j.class, j.teacher, j.stats.hadir, j.stats.sakit, j.stats.izin, j.stats.alpha, t]);
    });
    bodyRow(ws, r, ["TOTAL", "", "", "", tot.h, tot.s, tot.i, tot.a, tot.h + tot.s + tot.i + tot.a], true);
  }
  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as Uint8Array;
}

// ---------- PDF (jsPDF + autotable) ----------

function kopPdf(doc: jsPDF, title: string, periode: string, sch: ExportDir["school"]) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text(sch.name, w / 2, 14, { align: "center" });
  doc.setFont("helvetica", "italic"); doc.setFontSize(10);
  doc.text(`Tahun Ajaran ${sch.academicYear} · Semester ${sch.semester}`, w / 2, 20, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(title, w / 2, 27, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Periode: ${periode}`, w / 2, 33, { align: "center" });
}

function ttdBlock(doc: jsPDF, y: number) {
  const w = doc.internal.pageSize.getWidth();
  const yy = y + 14;
  doc.setFontSize(10);
  doc.text("Mengetahui,", 20, yy);
  doc.text("Kepala Sekolah", 20, yy + 6);
  doc.text("Admin", w - 20, yy, { align: "right" });
  doc.text("( ........................................... )", 20, yy + 30);
  doc.text("NIP. ........................................", 20, yy + 36);
  doc.text("( ........................................... )", w - 20, yy + 30, { align: "right" });
}

function footers(doc: jsPDF) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Halaman ${i} dari ${n}`, w / 2, h - 8, { align: "center" });
  }
}

export function buildRekapPdf(o: RekapOpts & { rows: FeedEntry[] }): Blob {
  const periode = periodeLabel(o.dari, o.sampai);
  const sch = (o.dir ?? defaultDir).school;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  if (o.tipe === "guru") {
    kopPdf(doc, "Rekap Kehadiran Guru", periode, sch);
    autoTable(doc, {
      startY: 37,
      head: [["No", "Tanggal", "Guru", "Mapel", "Kelas", "Jam (slot guru)", "Materi", "Status", "Keterangan"]],
      body: o.rows.map((j, i) => [i + 1, fmtID(j.date), j.teacher, j.subject, j.class, j.schedule || "-", j.material || "-", statusID(j.teacher_status), keterangan(j)]),
      foot: [[{ content: `TOTAL (${o.rows.length} jurnal) · Hadir: ${o.rows.filter((j) => j.teacher_status === "hadir").length} · Izin: ${o.rows.filter((j) => j.teacher_status === "izin").length} · Sakit: ${o.rows.filter((j) => j.teacher_status === "sakit").length}`, colSpan: 9 }]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [46, 91, 255], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 244, 255], textColor: 30, fontStyle: "bold" },
    });
  } else {
    kopPdf(doc, "Rekap Kehadiran Siswa", periode, sch);
    const tot = { h: 0, s: 0, i: 0, a: 0 };
    o.rows.forEach((j) => { tot.h += j.stats.hadir; tot.s += j.stats.sakit; tot.i += j.stats.izin; tot.a += j.stats.alpha; });
    autoTable(doc, {
      startY: 37,
      head: [["No", "Tanggal", "Kelas", "Guru", "H", "S", "I", "A"]],
      body: o.rows.map((j, i) => [i + 1, fmtID(j.date), j.class, j.teacher, j.stats.hadir, j.stats.sakit, j.stats.izin, j.stats.alpha]),
      foot: [[{ content: `TOTAL (${o.rows.length} jurnal)`, colSpan: 4 }, tot.h, tot.s, tot.i, tot.a]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [46, 91, 255], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [240, 244, 255], textColor: 30, fontStyle: "bold" },
    });
  }
  const y = (doc as any).lastAutoTable?.finalY || 60;
  ttdBlock(doc, y);
  footers(doc);
  return doc.output("blob");
}

// ---------- Unduhan ----------

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function authed(): Record<string, string> {
  const h: Record<string, string> = { Accept: "*/*" };
  const t = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function tryRemoteRekap(o: RekapOpts, format: "pdf" | "xlsx", filename: string): Promise<boolean> {
  try {
    const q = new URLSearchParams({ tipe: o.tipe });
    if (o.dari) q.set("tanggal_dari", o.dari);
    if (o.sampai) q.set("sampai", o.sampai);
    if (o.classId) q.set("class_id", o.classId);
    if (o.teacherId) q.set("teacher_id", o.teacherId);
    const path = format === "pdf" ? endpoints.rekapPdf : endpoints.rekapExcel;
    const res = await fetch(`${API_BASE}${path}?${q.toString()}`, { headers: authed(), signal: AbortSignal.timeout(10000) });
    if (!res.ok) return false;
    saveBlob(await res.blob(), filename);
    return true;
  } catch {
    return false;
  }
}

// Coba backend dulu, gagal → generate lokal. Lempar bila filter kosong.
export async function downloadRekap(o: RekapOpts & { format: "pdf" | "xlsx" }): Promise<"remote" | "local"> {
  const rows = filterRekap(o.feed, o.dari, o.sampai, o.classId, o.teacherId, o.dir);
  if (!rows.length) throw new Error("Tidak ada data pada filter ini.");
  const filename = rekapFilename(o.tipe, o.format, o.dari, o.sampai);
  if (await tryRemoteRekap(o, o.format, filename)) return "remote";
  if (o.format === "xlsx") {
    const buf = await buildRekapExcel({ ...o, rows });
    saveBlob(new Blob([buf as unknown as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  } else {
    saveBlob(buildRekapPdf({ ...o, rows }), filename);
  }
  return "local";
}
