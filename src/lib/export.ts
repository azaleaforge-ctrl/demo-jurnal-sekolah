import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { API_BASE, endpoints } from "./api";
import { school as fbSchool, students as fbStudents, classes as fbClasses, teachers as fbTeachers } from "./mock";
import type { FeedEntry } from "./feed";

// Format formal acuan docs/referensi-laporan.jpg (§4.5): kop 3 baris + garis,
// judul, meta 2 kolom, tabel 9 kolom + foto/TTD ter-embed, blok TTD 2 kolom.
// Backend GET /export/* dicoba dulu, gagal → generate lokal.

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
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export function fmtID(iso: string) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso || "-";
  return `${d} ${BULAN[m - 1]} ${y}`;
}

// "Selasa, 22 September 2026" seperti kolom Hari & Tanggal referensi.
export function hariTanggal(iso: string) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso || "-";
  return `${HARI[new Date(y, m - 1, d).getDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
}

// "07.00 s/d 08.30" dari label slot ("07.00 - 07.45" / "Jam 1 (07.00 – 07.45)").
export function jamRange(schedule?: string) {
  const m = (schedule || "").match(/(\d{2}\.\d{2})/g);
  if (m && m.length >= 2) return `${m[0]} s/d ${m[m.length - 1]}`;
  return schedule || "-";
}

// Periode gaya referensi: "Bulan September Tahun 2026".
export function metaPeriode(dari: string, sampai: string) {
  if (dari && sampai) {
    const [y1, m1] = dari.split("-").map(Number);
    const [y2, m2] = sampai.split("-").map(Number);
    if (y1 === y2 && m1 === m2 && m1 >= 1 && m1 <= 12) return `Bulan ${BULAN[m1 - 1]} Tahun ${y1}`;
    return `${fmtID(dari)} – ${fmtID(sampai)}`;
  }
  return "Semua Periode";
}

export function periodeLabel(dari: string, sampai: string) {
  if (dari && sampai) return dari === sampai ? fmtID(dari) : `${fmtID(dari)} – ${fmtID(sampai)}`;
  return "Semua periode";
}

export function rekapFilename(tipe: RekapTipe, format: "pdf" | "xlsx", dari: string, sampai: string) {
  const p = dari && sampai ? (dari === sampai ? dari : `${dari}_sd_${sampai}`) : "semua-periode";
  return `Rekap-${tipe === "guru" ? "Guru" : "Siswa"}-${p}.${format}`;
}

export function filterRekap(
  feed: FeedEntry[], dari: string, sampai: string,
  flt: { tipe: RekapTipe; classId?: string; teacherId?: string },
  dir: ExportDir = defaultDir,
) {
  const { tipe, classId, teacherId } = flt;
  // Aturan §3E: guru → teacher_id TUNGGAL wajib (class_id diabaikan);
  // siswa → class_id TUNGGAL wajib (teacher_id diabaikan).
  if (tipe === "guru" && !teacherId) throw new Error("Pilih guru terlebih dahulu.");
  if (tipe === "siswa" && !classId) throw new Error("Pilih kelas terlebih dahulu.");
  const cls = tipe === "siswa" && classId ? dir.classes.find((c) => c.id === classId) : undefined;
  const tch = tipe === "guru" && teacherId ? dir.teachers.find((t) => t.id === teacherId) : undefined;
  return feed
    .filter((f) => (!dari || f.date >= dari) && (!sampai || f.date <= sampai))
    .filter((f) => tipe !== "siswa" || !classId || f.class_id === classId || (!!cls && f.class === cls.name))
    .filter((f) => tipe !== "guru" || !teacherId || (f as any).teacher_id === teacherId || (!!tch && f.teacher === tch.name))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function studentOf(id: string, students: ExportDir["students"] = defaultDir.students) {
  return students.find((s) => s.id === id);
}

function guruPengampu(o: RekapOpts, rows: FeedEntry[]) {
  const dir = o.dir ?? defaultDir;
  if (o.teacherId) return dir.teachers.find((t) => t.id === o.teacherId)?.name || "-";
  const names = [...new Set(rows.map((r) => r.teacher))];
  return names.length === 1 ? names[0] : "Semua Guru";
}

function kelasMeta(o: RekapOpts, rows: FeedEntry[]) {
  const dir = o.dir ?? defaultDir;
  if (o.classId) return dir.classes.find((c) => c.id === o.classId)?.name || "-";
  const names = [...new Set(rows.map((r) => r.class))];
  return names.length === 1 ? names[0] : "Semua Kelas";
}

const fit = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ---------- Media: preload ke dataURL + dimensi (gagal → null → strip) ----------

type Media = { dataUrl: string; ext: "png" | "jpeg"; w: number; h: number } | null;

async function fetchMedia(src?: string): Promise<Media> {
  try {
    if (!src) return null;
    let dataUrl = src;
    if (!src.startsWith("data:")) {
      const res = await fetch(src);
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) return null;
      dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(blob);
      });
    }
    const m = /^data:(image\/(png|jpe?g));base64,(.+)$/.exec(dataUrl);
    if (!m) return null;
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 4, h: img.naturalHeight || 3 });
      img.onerror = () => resolve({ w: 4, h: 3 });
      img.src = dataUrl;
    });
    return { dataUrl, ext: m[1] === "image/png" ? "png" : "jpeg", ...dims };
  } catch {
    return null;
  }
}

// ---------- Excel (exceljs): struktur sama dengan referensi ----------

const BLUE = "FF2E5BFF";
const LINE = "FFD0D5DD";
const thin = { style: "thin" as const, color: { argb: LINE } };
const allBorder = { top: thin, left: thin, bottom: thin, right: thin };

// Kop 3 baris merge-centered + garis (border bawah tebal baris 3).
function kop3(ws: ExcelJS.Worksheet, schName: string, nCols: number) {
  const last = String.fromCharCode(64 + nCols);
  ws.mergeCells(`A1:${last}1`);
  ws.mergeCells(`A2:${last}2`);
  ws.mergeCells(`A3:${last}3`);
  const r1 = ws.getRow(1);
  r1.getCell(1).value = "PEMERINTAH DAERAH";
  r1.font = { bold: true, size: 12 };
  r1.alignment = { horizontal: "center" };
  const r2 = ws.getRow(2);
  r2.getCell(1).value = schName.toUpperCase();
  r2.font = { bold: true, size: 15 };
  r2.alignment = { horizontal: "center" };
  const r3 = ws.getRow(3);
  r3.getCell(1).value = "—";
  r3.font = { size: 10 };
  r3.alignment = { horizontal: "center" };
  for (let c = 1; c <= nCols; c++) {
    r3.getCell(c).border = { bottom: { style: "medium" as const, color: { argb: "FF101828" } } };
  }
}

function judulRow(ws: ExcelJS.Worksheet, n: number, title: string, nCols: number) {
  const last = String.fromCharCode(64 + nCols);
  ws.mergeCells(`A${n}:${last}${n}`);
  const r = ws.getRow(n);
  r.getCell(1).value = title;
  r.font = { bold: true, size: 12 };
  r.alignment = { horizontal: "center" };
}

// Meta 2 kolom: kiri A–D, kanan F–I.
function metaRow(ws: ExcelJS.Worksheet, n: number, lLabel: string, lVal: string, rLabel: string, rVal: string) {
  const r = ws.getRow(n);
  r.getCell(1).value = lLabel;
  r.getCell(1).font = { bold: true, size: 10 };
  ws.mergeCells(`B${n}:D${n}`);
  r.getCell(2).value = `: ${lVal}`;
  r.getCell(2).font = { size: 10 };
  r.getCell(6).value = rLabel;
  r.getCell(6).font = { bold: true, size: 10 };
  ws.mergeCells(`G${n}:I${n}`);
  r.getCell(7).value = `: ${rVal}`;
  r.getCell(7).font = { size: 10 };
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
  row.height = 24;
}

function bodyRow(ws: ExcelJS.Worksheet, n: number, vals: (string | number)[], bold = false, height?: number) {
  const row = ws.getRow(n);
  vals.forEach((v, i) => {
    const c = row.getCell(i + 1);
    c.value = v;
    if (bold) c.font = { bold: true };
    c.border = allBorder;
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  if (height) row.height = height;
}

// Blok TTD 2 kolom: kiri Guru Mapel (+nama), kanan tanggal akhir + Kepala Sekolah.
function ttdExcel(ws: ExcelJS.Worksheet, n: number, guruName: string, dateStr: string) {
  ws.mergeCells(`A${n}:D${n}`);
  ws.mergeCells(`F${n}:I${n}`);
  const r0 = ws.getRow(n);
  r0.getCell(1).value = "Mengetahui,";
  r0.getCell(6).value = dateStr;
  ws.mergeCells(`A${n + 1}:D${n + 1}`);
  ws.mergeCells(`F${n + 1}:I${n + 1}`);
  const r1 = ws.getRow(n + 1);
  r1.getCell(1).value = "Guru Mata Pelajaran";
  r1.getCell(6).value = "Kepala Sekolah";
  const r4 = ws.getRow(n + 4);
  ws.mergeCells(`A${n + 4}:D${n + 4}`);
  ws.mergeCells(`F${n + 4}:I${n + 4}`);
  r4.getCell(1).value = guruName;
  r4.getCell(1).font = { bold: true };
  r4.getCell(6).value = "Kepala Sekolah";
  r4.getCell(6).font = { bold: true };
  const r5 = ws.getRow(n + 5);
  ws.mergeCells(`A${n + 5}:D${n + 5}`);
  ws.mergeCells(`F${n + 5}:I${n + 5}`);
  r5.getCell(1).value = "______________________";
  r5.getCell(6).value = "______________________";
}

function printSetup(ws: ExcelJS.Worksheet) {
  ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

// Embed gambar TEPAT di tengah sel: offset dari lebar kolom + tinggi baris aktual.
function embedCell(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, m: Media, col: number, row: number, pxCol: number, rowPt: number) {
  if (!m) return;
  const id = wb.addImage({ base64: m.dataUrl.split(",")[1], extension: m.ext });
  const rowPx = rowPt * 96 / 72;
  const pxH = rowPx - 8;
  const scale = Math.min(pxCol / m.w, pxH / m.h);
  const dw = Math.max(8, Math.floor(m.w * scale));
  const dh = Math.max(8, Math.floor(m.h * scale));
  const colW = pxCol || 1;
  ws.addImage(id, {
    tl: { col: col + (colW - dw) / 2 / colW, row: row - 1 + (rowPx - dh) / 2 / rowPx },
    ext: { width: dw, height: dh },
  });
}

export async function buildRekapExcel(o: RekapOpts & { rows: FeedEntry[] }): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const dir = o.dir ?? defaultDir;
  const sch = dir.school;
  const guruName = o.tipe === "guru" ? guruPengampu(o, o.rows) : o.rows[0]?.teacher || "-";
  const dateStr = o.sampai ? fmtID(o.sampai) : o.dari ? fmtID(o.dari) : "-";

  if (o.tipe === "guru") {
    const ws = wb.addWorksheet("Laporan Jurnal");
    ws.columns = [{ width: 5 }, { width: 22 }, { width: 18 }, { width: 14 }, { width: 22 }, { width: 28 }, { width: 32 }, { width: 16 }, { width: 16 }];
    kop3(ws, sch.name, 9);
    judulRow(ws, 4, "LAPORAN JURNAL KEGIATAN BELAJAR MENGAJAR", 9);
    metaRow(ws, 5, "Tahun Pelajaran", `${sch.academicYear}`, "Guru Pengampu", guruName);
    metaRow(ws, 6, "Semester", sch.semester, "Periode", metaPeriode(o.dari, o.sampai));
    headerRow(ws, 7, ["No", "Hari & Tanggal", "Jam Pelaksanaan", "Kelas", "Nama Guru", "Materi Pembelajaran", "Catatan", "Foto Dokumentasi", "Tanda Tangan Guru"]);
    const media = await Promise.all(o.rows.map(async (j) => ({ foto: await fetchMedia(j.photo), ttd: await fetchMedia(j.signature) })));
    o.rows.forEach((j, i) => {
      const r = 8 + i;
      bodyRow(ws, r, [
        i + 1, hariTanggal(j.date), jamRange(j.schedule), j.class, j.teacher,
        j.material || "-", j.notes || "-",
        media[i].foto ? "" : j.photo ? "Ada" : "-", media[i].ttd ? "" : j.signature ? "Ada" : "-",
      ], false, 64);
      embedCell(wb, ws, media[i].foto, 7, r, 108, 64);
      embedCell(wb, ws, media[i].ttd, 8, r, 108, 64);
    });
    ttdExcel(ws, 9 + o.rows.length, guruName, dateStr);
    ws.views = [{ state: "frozen", ySplit: 7 }];
    ws.autoFilter = { from: "A7", to: "I7" };
    printSetup(ws);
  } else {
    const ws = wb.addWorksheet("Rekap Siswa");
    ws.columns = [{ width: 5 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 26 }, { width: 7 }, { width: 7 }, { width: 7 }, { width: 7 }];
    kop3(ws, sch.name, 9);
    judulRow(ws, 4, "LAPORAN REKAPITULASI KEHADIRAN SISWA", 9);
    metaRow(ws, 5, "Tahun Pelajaran", `${sch.academicYear}`, "Kelas", kelasMeta(o, o.rows));
    metaRow(ws, 6, "Semester", sch.semester, "Periode", metaPeriode(o.dari, o.sampai));
    let r = 7;
    headerRow(ws, r, ["No", "Hari & Tanggal", "Kelas", "NISN", "Nama", "H", "S", "I", "A"]);
    ws.views = [{ state: "frozen", ySplit: r }];
    ws.autoFilter = { from: `A${r}`, to: `I${r}` };
    r++;
    let no = 1;
    const withAtt = o.rows.filter((j) => (j.attendances || []).length > 0);
    withAtt.forEach((j) => {
      (j.attendances || []).forEach((at) => {
        const st = studentOf(at.student_id, dir.students);
        const nm = st?.name || at.student_id;
        bodyRow(ws, r++, [no++, hariTanggal(j.date), j.class, st?.nisn || "-", nm,
          at.status === "hadir" ? "✓" : "", at.status === "sakit" ? "✓" : "",
          at.status === "izin" ? "✓" : "", at.status === "alpha" ? "✓" : ""], false, 20);
      });
    });
    const rest = o.rows.filter((j) => !(j.attendances || []).length);
    if (rest.length) {
      r++;
      ws.mergeCells(`A${r}:I${r}`);
      bodyRow(ws, r++, ["REKAP PER JURNAL (AGREGAT)", "", "", "", "", "", "", "", ""], true);
      headerRow(ws, r, ["No", "Hari & Tanggal", "Kelas", "Guru", "H", "S", "I", "A", "Total"]);
      r++;
      rest.forEach((j, i) => {
        const t = j.stats.hadir + j.stats.sakit + j.stats.izin + j.stats.alpha;
        bodyRow(ws, r++, [i + 1, hariTanggal(j.date), j.class, j.teacher, j.stats.hadir, j.stats.sakit, j.stats.izin, j.stats.alpha, t], false, 20);
      });
    }
    ttdExcel(ws, r + 1, guruName, dateStr);
    printSetup(ws);

    // Sheet 2 = TOTAL KESELURUHAN (H/S/I/A + %hadir) — agregat stats per kelas.
    const ws2 = wb.addWorksheet("Total Keseluruhan");
    ws2.columns = [{ width: 26 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }];
    kop3(ws2, sch.name, 6);
    judulRow(ws2, 4, "TOTAL KESELURUHAN KEHADIRAN SISWA", 6);
    ws2.mergeCells("A5:F5");
    ws2.getRow(5).getCell(1).value = `Kelas: ${kelasMeta(o, o.rows)} · Periode: ${metaPeriode(o.dari, o.sampai)}`;
    ws2.getRow(5).getCell(1).font = { size: 10 };
    headerRow(ws2, 6, ["Kelas", "H", "S", "I", "A", "%Hadir"]);
    const byCls = new Map<string, { h: number; s: number; i: number; a: number }>();
    o.rows.forEach((j) => {
      const g = byCls.get(j.class) || { h: 0, s: 0, i: 0, a: 0 };
      g.h += j.stats.hadir; g.s += j.stats.sakit; g.i += j.stats.izin; g.a += j.stats.alpha;
      byCls.set(j.class, g);
    });
    let r2 = 7;
    const gt = { h: 0, s: 0, i: 0, a: 0 };
    [...byCls.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([name, g]) => {
      const t = g.h + g.s + g.i + g.a;
      gt.h += g.h; gt.s += g.s; gt.i += g.i; gt.a += g.a;
      bodyRow(ws2, r2++, [name, g.h, g.s, g.i, g.a, t ? `${Math.round((g.h / t) * 100)}%` : "-"], false, 20);
    });
    const gtTot = gt.h + gt.s + gt.i + gt.a;
    bodyRow(ws2, r2, ["TOTAL", gt.h, gt.s, gt.i, gt.a, gtTot ? `${Math.round((gt.h / gtTot) * 100)}%` : "-"], true, 20);
    ws2.views = [{ state: "frozen", ySplit: 6 }];
    ws2.autoFilter = { from: "A6", to: "F6" };
    printSetup(ws2);
  }
  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as Uint8Array;
}

// ---------- PDF (jsPDF + autotable): susunan persis referensi ----------

function kopPdf(doc: jsPDF, schName: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("PEMERINTAH DAERAH", w / 2, 12, { align: "center" });
  doc.setFontSize(15);
  doc.text(schName.toUpperCase(), w / 2, 19, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text("—", w / 2, 24, { align: "center" });
  doc.setLineWidth(0.8);
  doc.line(10, 27, w - 10, 27);
  doc.setLineWidth(0.3);
  doc.line(10, 28.5, w - 10, 28.5);
  return 33;
}

function metaPdf(doc: jsPDF, y: number, l1: [string, string], l2: [string, string], r1: [string, string], r2: [string, string]) {
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(l1[0], 14, y); doc.text(r1[0], 160, y);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${fit(l1[1], 34)}`, 58, y); doc.text(`: ${fit(r1[1], 30)}`, 206, y);
  doc.setFont("helvetica", "bold");
  doc.text(l2[0], 14, y + 6); doc.text(r2[0], 160, y + 6);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${fit(l2[1], 34)}`, 58, y + 6); doc.text(`: ${fit(r2[1], 30)}`, 206, y + 6);
  return y + 11;
}

function ttdPdf(doc: jsPDF, y: number, guruName: string, dateStr: string) {
  const w = doc.internal.pageSize.getWidth();
  if (y > 150) { doc.addPage(); y = 20; }
  doc.setFontSize(10);
  doc.text("Mengetahui,", 30, y);
  doc.text("Guru Mata Pelajaran", 30, y + 6);
  doc.text(dateStr, w - 30, y, { align: "right" });
  doc.text("Kepala Sekolah", w - 30, y + 6, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(fit(guruName, 30), 30, y + 30);
  doc.text("Kepala Sekolah", w - 30, y + 30, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text("______________________", 30, y + 36);
  doc.text("______________________", w - 30, y + 36, { align: "right" });
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

// Satu definisi kolom + grid untuk SEMUA tabel guru 9-kolom (head & body selalu sejajar).
const GURU_COLS = {
  0: { cellWidth: 8 }, 1: { cellWidth: 30 }, 2: { cellWidth: 24 }, 3: { cellWidth: 22 },
  4: { cellWidth: 30 }, 5: { cellWidth: 44 }, 6: { cellWidth: 44 }, 7: { cellWidth: 36 }, 8: { cellWidth: 39 },
};
// Garis grid penuh di SEMUA sel termasuk header (bukan hanya body).
const GRID = { lineWidth: 0.3, lineColor: [70, 70, 70] as [number, number, number] };
const HEAD_TXT = {
  halign: "center" as const, valign: "middle" as const, fontStyle: "bold" as const,
  overflow: "linebreak" as const, fontSize: 8, minCellHeight: 14, ...GRID,
};
const BODY_TXT = { fontSize: 8, halign: "center" as const, valign: "middle" as const, overflow: "linebreak" as const, ...GRID };
// Semua sel body rata tengah (No s/d agregat) — ditegaskan lagi per tabel via bodyStyles.
const BODY_CENTER = { halign: "center" as const, valign: "middle" as const };
const TABLE_MARGIN = { left: 10, right: 10 };

// Gambar contain ke dalam sel (didDrawCell, sinkron — media di-preload dulu).
function drawContain(doc: jsPDF, m: Media, x: number, y: number, w: number, h: number) {
  if (!m) return;
  const s = Math.min(w / m.w, h / m.h);
  const dw = Math.max(2, m.w * s);
  const dh = Math.max(2, m.h * s);
  doc.addImage(m.dataUrl, m.ext === "png" ? "PNG" : "JPEG", x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function buildRekapPdf(o: RekapOpts & { rows: FeedEntry[] }): Blob {
  const sch = (o.dir ?? defaultDir).school;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const guruName = o.tipe === "guru" ? guruPengampu(o, o.rows) : o.rows[0]?.teacher || "-";
  const dateStr = o.sampai ? fmtID(o.sampai) : o.dari ? fmtID(o.dari) : "-";

  if (o.tipe === "guru") {
    // Varian sinkron (tanpa embed gambar — untuk pemakaian langsung);
    // downloadRekap memakai buildRekapPdfAsync yang meng-embed foto/TTD.
    let y = kopPdf(doc, sch.name);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("LAPORAN JURNAL KEGIATAN BELAJAR MENGAJAR", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
    y = metaPdf(doc, y + 7,
      ["Tahun Pelajaran", `${sch.academicYear}`], ["Semester", sch.semester],
      ["Guru Pengampu", guruName], ["Periode", metaPeriode(o.dari, o.sampai)]);
    autoTable(doc, {
      startY: y + 4,
      margin: TABLE_MARGIN,
      head: [["No", "Hari & Tanggal", "Jam Pelaksanaan", "Kelas", "Nama Guru", "Materi Pembelajaran", "Catatan", "Foto Dokumentasi", "Tanda Tangan Guru"]],
      body: o.rows.map((j, i) => [
        i + 1, hariTanggal(j.date), jamRange(j.schedule), j.class, j.teacher,
        j.material || "-", j.notes || "-", j.photo ? "Ada" : "-", j.signature ? "Ada" : "-",
      ]),
      styles: BODY_TXT,
      bodyStyles: BODY_CENTER,
      headStyles: HEAD_TXT,
      columnStyles: GURU_COLS,
      theme: "grid",
    });
    ttdPdf(doc, (doc as any).lastAutoTable.finalY + 8, guruName, dateStr);
    footers(doc);
    return doc.output("blob");
  }

  let y = kopPdf(doc, sch.name);
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("LAPORAN REKAPITULASI KEHADIRAN SISWA", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
  y = metaPdf(doc, y + 7,
    ["Tahun Pelajaran", `${sch.academicYear}`], ["Semester", sch.semester],
    ["Kelas", kelasMeta(o, o.rows)], ["Periode", metaPeriode(o.dari, o.sampai)]);
  const dir = o.dir ?? defaultDir;
  const withAtt = o.rows.filter((j) => (j.attendances || []).length > 0);
  autoTable(doc, {
    startY: y + 4,
    margin: TABLE_MARGIN,
    head: [["No", "Hari & Tanggal", "Kelas", "NISN", "Nama", "H", "S", "I", "A"]],
    body: withAtt.flatMap((j) => (j.attendances || []).map((at) => {
      const st = studentOf(at.student_id, dir.students);
      return ["", hariTanggal(j.date), j.class, st?.nisn || "-", st?.name || at.student_id,
        at.status === "hadir" ? "✓" : "", at.status === "sakit" ? "✓" : "",
        at.status === "izin" ? "✓" : "", at.status === "alpha" ? "✓" : ""];
    })).map((r, i) => [i + 1, ...r.slice(1)]),
    styles: BODY_TXT,
    bodyStyles: BODY_CENTER,
    headStyles: HEAD_TXT,
    theme: "grid",
    columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 38 }, 2: { cellWidth: 24 }, 3: { cellWidth: 24 }, 5: { cellWidth: 10 }, 6: { cellWidth: 10 }, 7: { cellWidth: 10 }, 8: { cellWidth: 10 } },
  });
  const rest = o.rows.filter((j) => !(j.attendances || []).length);
  if (rest.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 6,
      margin: TABLE_MARGIN,
      head: [["No", "Hari & Tanggal", "Kelas", "Guru", "H", "S", "I", "A", "Total"]],
      body: rest.map((j, i) => {
        const t = j.stats.hadir + j.stats.sakit + j.stats.izin + j.stats.alpha;
        return [i + 1, hariTanggal(j.date), j.class, j.teacher, j.stats.hadir, j.stats.sakit, j.stats.izin, j.stats.alpha, t];
      }),
      styles: BODY_TXT,
      bodyStyles: BODY_CENTER,
      headStyles: HEAD_TXT,
      theme: "grid",
      columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 38 }, 2: { cellWidth: 24 }, 3: { cellWidth: 30 }, 5: { cellWidth: 10 }, 6: { cellWidth: 10 }, 7: { cellWidth: 10 }, 8: { cellWidth: 14 } },
    });
  }
  // TOTAL KESELURUHAN — selalu di halaman paling bawah/terakhir.
  const byCls = new Map<string, { h: number; s: number; i: number; a: number }>();
  o.rows.forEach((j) => {
    const g = byCls.get(j.class) || { h: 0, s: 0, i: 0, a: 0 };
    g.h += j.stats.hadir; g.s += j.stats.sakit; g.i += j.stats.izin; g.a += j.stats.alpha;
    byCls.set(j.class, g);
  });
  const gt = { h: 0, s: 0, i: 0, a: 0 };
  const gtBody: (string | number)[][] = [...byCls.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, g]) => {
    const t = g.h + g.s + g.i + g.a;
    gt.h += g.h; gt.s += g.s; gt.i += g.i; gt.a += g.a;
    return [name, g.h, g.s, g.i, g.a, t ? `${Math.round((g.h / t) * 100)}%` : "-"];
  });
  const gtTot = gt.h + gt.s + gt.i + gt.a;
  gtBody.push(["TOTAL KESELURUHAN", gt.h, gt.s, gt.i, gt.a, gtTot ? `${Math.round((gt.h / gtTot) * 100)}%` : "-"]);
  let ty = (doc as any).lastAutoTable.finalY + 8;
  if (ty > 150) { doc.addPage(); ty = 20; } // cek sisa ruang → halaman baru bila perlu
  autoTable(doc, {
    startY: ty,
    margin: TABLE_MARGIN,
    head: [["Kelas", "H", "S", "I", "A", "%Hadir"]],
    body: gtBody,
    styles: BODY_TXT,
    bodyStyles: BODY_CENTER,
    headStyles: HEAD_TXT,
    theme: "grid",
    columnStyles: { 1: { cellWidth: 14 }, 2: { cellWidth: 14 }, 3: { cellWidth: 14 }, 4: { cellWidth: 14 }, 5: { cellWidth: 18 } },
  });
  ttdPdf(doc, (doc as any).lastAutoTable.finalY + 8, guruName, dateStr);
  footers(doc);
  return doc.output("blob");
}

// Guru butuh preload media (async) → dipisah agar buildRekapPdf tetap sinkron.
async function buildGuruMedia(rows: FeedEntry[]) {
  return Promise.all(rows.map(async (j) => ({ foto: await fetchMedia(j.photo), ttd: await fetchMedia(j.signature) })));
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

// Coba backend dulu, gagal → generate lokal. Lempar bila filter kosong / tak terkunci.
export async function downloadRekap(o: RekapOpts & { format: "pdf" | "xlsx" }): Promise<"remote" | "local"> {
  const rows = filterRekap(o.feed, o.dari, o.sampai, { tipe: o.tipe, classId: o.classId, teacherId: o.teacherId }, o.dir);
  if (!rows.length) throw new Error("Tidak ada data pada filter ini.");
  const filename = rekapFilename(o.tipe, o.format, o.dari, o.sampai);
  if (await tryRemoteRekap(o, o.format, filename)) return "remote";
  if (o.format === "xlsx") {
    const buf = await buildRekapExcel({ ...o, rows });
    saveBlob(new Blob([buf as unknown as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
  } else {
    saveBlob(await buildRekapPdfAsync({ ...o, rows }), filename);
  }
  return "local";
}

// PDF guru butuh preload gambar → varian async; fallback sinkron bila preload gagal total.
export async function buildRekapPdfAsync(o: RekapOpts & { rows: FeedEntry[] }): Promise<Blob> {
  if (o.tipe !== "guru") return buildRekapPdf(o);
  const sch = (o.dir ?? defaultDir).school;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const guruName = guruPengampu(o, o.rows);
  const dateStr = o.sampai ? fmtID(o.sampai) : o.dari ? fmtID(o.dari) : "-";
  let y = kopPdf(doc, sch.name);
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("LAPORAN JURNAL KEGIATAN BELAJAR MENGAJAR", doc.internal.pageSize.getWidth() / 2, y, { align: "center" });
  y = metaPdf(doc, y + 7,
    ["Tahun Pelajaran", `${sch.academicYear}`], ["Semester", sch.semester],
    ["Guru Pengampu", guruName], ["Periode", metaPeriode(o.dari, o.sampai)]);
  const media = await buildGuruMedia(o.rows);
  autoTable(doc, {
    startY: y + 4,
    margin: TABLE_MARGIN,
    head: [["No", "Hari & Tanggal", "Jam Pelaksanaan", "Kelas", "Nama Guru", "Materi Pembelajaran", "Catatan", "Foto Dokumentasi", "Tanda Tangan Guru"]],
    body: o.rows.map((j, i) => [
      i + 1, hariTanggal(j.date), jamRange(j.schedule), j.class, j.teacher,
      j.material || "-", j.notes || "-",
      media[i].foto ? " " : j.photo ? "Ada" : "-", media[i].ttd ? " " : j.signature ? "Ada" : "-",
    ]),
    styles: { ...BODY_TXT, minCellHeight: 24 },
    bodyStyles: BODY_CENTER,
    headStyles: HEAD_TXT,
    theme: "grid",
    columnStyles: GURU_COLS,
    didDrawCell: (d: any) => {
      if (d.section !== "body") return;
      const m = d.column.index === 7 ? media[d.row.index]?.foto : d.column.index === 8 ? media[d.row.index]?.ttd : null;
      if (!m) return;
      drawContain(doc, m, d.cell.x + 2, d.cell.y + 2, d.cell.width - 4, d.cell.height - 4);
    },
  });
  ttdPdf(doc, (doc as any).lastAutoTable.finalY + 8, guruName, dateStr);
  footers(doc);
  return doc.output("blob");
}
