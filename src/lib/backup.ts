import JSZip from "jszip";
import { deleteObject, ref } from "firebase/storage";
import { buildRekapExcel, buildRekapPdfAsync, compareJournalNewest, filterRekap, type ExportDir, type RekapTipe } from "./export";
import type { FeedEntry } from "./feed";
import { uploadBlob } from "./db";
import { storage } from "./firebase";

// Prinsip arsip (soft-archive, TANPA delete data asli):
// - Feed realtime (dashboard/export/riwayat) dibatasi sejak awal bulan BERJALAN.
// - Halaman Backup menampilkan DUA tabel:
//   A. "Arsip Sementara" (koleksi temp_archives): salinan (copy) bulan yang
//      sedang dilihat — BOLEH bulan berjalan; satu bulan boleh punya beberapa
//      (doc id temp-YYYY-MM-<timestamp>); hapus per baris hanya hapus copy itu.
//   B. "Backup Data Bulanan" (koleksi archives): hanya bulan lewat yang
//      tersegel (auto-seal system-auto saat halaman dibuka) + final/permanen.
// - journals & student_attendances asli TIDAK PERNAH dihapus di semua tingkat.

export type BackupFormat = "xlsx" | "pdf";
export type BackupTipe = RekapTipe; // "guru" | "siswa"

const BULAN_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// "2026-08" → { dari: "2026-08-01", sampai: "2026-08-31" }. Backup bulanan saja.
export function monthRange(bulan: string): { dari: string; sampai: string } {
  if (!MONTH_RE.test(bulan)) throw new Error("Bulan harus format YYYY-MM.");
  const [y, m] = bulan.split("-").map(Number);
  return { dari: `${bulan}-01`, sampai: `${bulan}-${new Date(y, m, 0).getDate()}` };
}

// "2026-08" → "Agustus 2026".
export function monthLabel(bulan: string): string {
  const [y, m] = bulan.split("-").map(Number);
  if (!y || m < 1 || m > 12) return bulan;
  return `${BULAN_ID[m - 1]} ${y}`;
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Default picker = bulan lalu (langsung bisa diarsip).
export function prevMonth(month = currentMonth()): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return currentMonth(d);
}

// Satu kesatuan per bulan dalam 1 file ZIP (client-side via jszip):
//   Backup-{Bulan Tahun}.zip
//   └── {Bulan Tahun}/Guru/{Nama Guru}/00-Rekap-Bulanan-{Nama}.xlsx (+ .pdf)
//                        └─ Harian/Excel/{YYYY-MM-DD}-{Nama}.xlsx
//                        └─ Harian/PDF/{YYYY-MM-DD}-{Nama}.pdf
//   └── {Bulan Tahun}/Siswa/{Nama Kelas}/... (pola sama)
// File bulanan ikut builder existing (boleh embed foto); file harian TANPA foto
// embed (ringan — kolom jadi "Ada"). Hanya tanggal berdata yang dibuat
// (hari kosong tetap tercakup agregat di file bulanan).

// Root folder di dalam zip = nama "Bulan Tahun" Indonesia, mis. "Agustus 2026".
export function backupFolder(bulan: string): string {
  return monthLabel(bulan);
}

export function backupZipName(bulan: string): string {
  return `Backup-${monthLabel(bulan)}.zip`;
}

// Path file permanen di Firebase Storage (reuse uploadBlob existing).
export function backupStoragePath(bulan: string): string {
  return `backups/${bulan}/${backupZipName(bulan)}`;
}

// Upload ZIP permanen → kembalikan URL unduh (instan, tanpa generate ulang).
export async function uploadBackupZip(bulan: string, blob: Blob): Promise<string> {
  return uploadBlob(backupStoragePath(bulan), blob, "application/zip");
}

// Hapus file permanen via URL-nya (untuk reset permanen).
export async function deleteStorageUrl(url: string): Promise<void> {
  if (!storage) throw new Error("Storage tak terjangkau");
  await deleteObject(ref(storage, url));
}

// Buang karakter ilegal path Windows (/ \ : * ? " < > |).
export function sanitizeName(s: string): string {
  const c = String(s ?? "").replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  return c || "-";
}

export type ZipProgress = (done: number, total: number, lastBytes?: number) => void;

// Dilempar saat pengguna menekan Batal di modal progres — bukan error,
// ditangkap pemanggil untuk toast "Unduhan dibatalkan" tanpa file setengah jadi.
export class BackupCancelledError extends Error {
  constructor() {
    super("Unduhan dibatalkan");
    this.name = "BackupCancelledError";
  }
}
export function isBackupCancelled(e: unknown): boolean {
  return e instanceof BackupCancelledError;
}

// Format ringkas untuk popup progres.
export function formatBytes(b: number): string {
  if (!b || b <= 0) return "0 B";
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// Detik → "±45 dtk" / "±2 mnt 10 dtk" untuk ETA dinamis.
export function formatEta(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "";
  const s = Math.max(1, Math.round(sec));
  if (s < 60) return `±${s} dtk`;
  return `±${Math.floor(s / 60)} mnt ${s % 60} dtk`;
}

// Placeholder data: agar fetchMedia di export.ts lewati jaringan (tanpa fetch,
// langsung null) namun kolom foto/TTD tetap tulis "Ada" bila URL asli ada.
const NO_FETCH = "data:,no-fetch";
const stripMedia = (f: FeedEntry): FeedEntry => ({
  ...f,
  photo: f.photo ? NO_FETCH : "",
  signature: f.signature ? NO_FETCH : "",
});

const uniqNames = (xs: (string | undefined)[]) =>
  [...new Set(xs.map((x) => (x || "").trim()).filter((x) => x && x !== "-"))]
    .sort((a, b) => a.localeCompare(b, "id"));

// Lepas event-loop antar file agar UI (progres) tak freeze.
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

type ZipJob = { path: string; run: () => Promise<Blob | Uint8Array> };

type MonthGroup = { name: string; mine: FeedEntry[]; dates: string[] };

// Kelompokkan isi bulan per guru & per kelas (dipakai zip + estimasi).
// Grup nama A–Z (uniqNames, locale id); di dalam grup terbaru dulu
// (compareJournalNewest) — tanpa grup/tanggal acak.
function groupMonth(feed: FeedEntry[], dari: string, sampai: string) {
  const inMonth = feed.filter((f) => f.date >= dari && f.date <= sampai);
  const mk = (key: "teacher" | "class"): MonthGroup[] =>
    uniqNames(inMonth.map((f) => f[key])).map((name) => {
      const mine = inMonth
        .filter((f) => (f[key] || "").trim() === name)
        .sort(compareJournalNewest);
      return { name, mine, dates: uniqNames(mine.map((f) => f.date)) };
    });
  return { inMonth, teachers: mk("teacher"), classes: mk("class") };
}

// Estimasi SEBELUM unduh: jumlah file + ukuran kasar (overhead/file 30KB +
// per jurnal 60KB + per absensi 1KB). Labeli "estimasi" — ukuran pasti
// (MB) tampil setelah ZIP jadi.
export function estimateMonthZip(feed: FeedEntry[], dari: string, sampai: string) {
  const g = groupMonth(feed, dari, sampai);
  const files =
    g.teachers.reduce((a, t) => a + 2 + t.dates.length * 2, 0) +
    g.classes.reduce((a, c) => a + 2 + c.dates.length * 2, 0);
  const st = buildBackupStats(feed, dari, sampai);
  const att = st.hadir + st.sakit + st.izin + st.alpha;
  const estBytes = files * 30 * 1024 + st.journals * 60 * 1024 + att * 1024;
  return { files, teachers: g.teachers.length, classes: g.classes.length, journals: st.journals, estBytes };
}

// Kandidat auto-seal: bulan penuh yang sudah lewat + ada data + belum disegel
// + tidak dalam daftar reset-permanen (skipIds dari archive_resets).
// Dipakai halaman Backup (tanpa cron): segel dibuat saat halaman dibuka.
export function pastUnsealedMonths(
  feed: FeedEntry[], sealedIds: string[], now = new Date(), skipIds: string[] = [],
): string[] {
  const cur = currentMonth(now);
  return listArchiveMonths(feed).filter((m) => {
    if (m >= cur || sealedIds.includes(m) || skipIds.includes(m)) return false;
    const { dari, sampai } = monthRange(m);
    return buildBackupStats(feed, dari, sampai).journals > 0;
  });
}

// Bangun isi ZIP sebulan: per guru & per kelas → rekap bulanan (xlsx+pdf,
// prefix 00 agar paling atas) + harian (xlsx+pdf, folder Excel/PDF) per
// tanggal yang ada datanya.
// Hari kosong di-skip (tetap tercakup agregat di file bulanan). Sekuensial.
export async function buildMonthZip(o: {
  bulan: string; dari: string; sampai: string;
  rows: FeedEntry[]; dir: ExportDir; onFile?: ZipProgress;
  shouldAbort?: () => boolean;
}): Promise<{ blob: Blob; files: number; teachers: number; classes: number }> {
  const { bulan, dari, sampai, rows, dir, onFile, shouldAbort } = o;
  const root = sanitizeName(backupFolder(bulan));
  const g = groupMonth(rows, dari, sampai);
  if (!g.inMonth.length || (!g.teachers.length && !g.classes.length)) throw new Error("Tidak ada data pada bulan ini.");

  const jobs: ZipJob[] = [];
  const monthly = (tipe: BackupTipe, list: FeedEntry[]) => ({
    xlsx: () => buildRekapExcel({ tipe, periode: "bulanan", dari, sampai, feed: list, dir, rows: list }),
    pdf: () => buildRekapPdfAsync({ tipe, periode: "bulanan", dari, sampai, feed: list, dir, rows: list }),
  });
  const dailyXlsx = (tipe: BackupTipe, day: FeedEntry[], d: string) => () =>
    buildRekapExcel({ tipe, periode: "harian", dari: d, sampai: d, feed: day, dir, rows: day });
  const dailyPdf = (tipe: BackupTipe, day: FeedEntry[], d: string) => () =>
    buildRekapPdfAsync({ tipe, periode: "harian", dari: d, sampai: d, feed: day, dir, rows: day });
  const pushSet = (kind: "Guru" | "Siswa", tipe: BackupTipe, grp: MonthGroup) => {
    const s = sanitizeName(grp.name);
    const base = `${root}/${kind}/${s}`;
    const m = monthly(tipe, grp.mine);
    jobs.push({ path: `${base}/00-Rekap-Bulanan-${s}.xlsx`, run: m.xlsx });
    jobs.push({ path: `${base}/00-Rekap-Bulanan-${s}.pdf`, run: m.pdf });
    grp.dates.forEach((d) => {
      const day = grp.mine.filter((f) => f.date === d).map(stripMedia);
      jobs.push({ path: `${base}/Harian/Excel/${d}-${s}.xlsx`, run: dailyXlsx(tipe, day, d) });
      jobs.push({ path: `${base}/Harian/PDF/${d}-${s}.pdf`, run: dailyPdf(tipe, day, d) });
    });
  };
  g.teachers.forEach((t) => pushSet("Guru", "guru", t));
  g.classes.forEach((c) => pushSet("Siswa", "siswa", c));

  const zip = new JSZip();
  let done = 0;
  for (const j of jobs) {
    if (shouldAbort?.()) throw new BackupCancelledError();
    const data = await j.run();
    if (shouldAbort?.()) throw new BackupCancelledError();
    zip.file(j.path, data);
    done++;
    onFile?.(done, jobs.length, data instanceof Blob ? data.size : data.byteLength);
    await tick();
  }
  if (shouldAbort?.()) throw new BackupCancelledError();
  const blob = await zip.generateAsync({ type: "blob" });
  return { blob, files: jobs.length, teachers: g.teachers.length, classes: g.classes.length };
}

// Bulan-bulan unik yang ada di feed, terbaru dulu (untuk chip jalan pintas).
export function listArchiveMonths(feed: Pick<FeedEntry, "date">[]): string[] {
  const set = new Set<string>();
  feed.forEach((f) => {
    const m = String(f.date || "").slice(0, 7);
    if (MONTH_RE.test(m)) set.add(m);
  });
  return [...set].sort().reverse();
}

// true bila boleh disegel: bulan sudah selesai. Bulan berjalan & masa depan ditolak.
export function canArchive(bulan: string, now = new Date()): boolean {
  if (!MONTH_RE.test(bulan)) return false;
  return bulan < currentMonth(now);
}

export type BackupStats = {
  journals: number; hadir: number; sakit: number; izin: number; alpha: number;
  teachers: number; classes: number;
};

// Agregat sebulan penuh TANPA kunci §3E (arsip = semua guru + semua kelas).
export function buildBackupStats(feed: FeedEntry[], dari: string, sampai: string): BackupStats {
  const t = new Set<string>();
  const c = new Set<string>();
  const s = { journals: 0, hadir: 0, sakit: 0, izin: 0, alpha: 0 };
  feed.forEach((f) => {
    if ((dari && f.date < dari) || (sampai && f.date > sampai)) return;
    s.journals++;
    s.hadir += f.stats.hadir; s.sakit += f.stats.sakit;
    s.izin += f.stats.izin; s.alpha += f.stats.alpha;
    if (f.teacher && f.teacher !== "-") t.add(f.teacher);
    if (f.class && f.class !== "-") c.add(f.class);
  });
  return { ...s, teachers: t.size, classes: c.size };
}

// Reuse filterRekap untuk pratinjau TERKUNCI §3E (1 guru / 1 kelas wajib).
// Pratinjau arsip sebulan penuh memakai filter tanggal biasa (lihat buildBackupStats).
export function filterMonthLocked(
  feed: FeedEntry[], dari: string, sampai: string,
  flt: { tipe: BackupTipe; classId?: string; teacherId?: string },
  dir?: ExportDir,
) {
  return filterRekap(feed, dari, sampai, flt, dir);
}

// Skema ARSIP SEMENTARA: temp_archives/temp-YYYY-MM-<timestamp>
// Salinan (snapshot counts) bulan yang dilihat — boleh bulan berjalan;
// satu bulan boleh punya beberapa arsip. Hapus = hapus doc copy saja.
export type TempArchive = {
  month: string; dari: string; sampai: string;
  counts: BackupStats; createdBy: string; createdAt: string;
};
export function tempArchiveId(month: string, at = Date.now()): string {
  return `temp-${month}-${at}`;
}

// Skema BACKUP DATA BULANAN: archives/YYYY-MM (hanya bulan lewat)
// - Sementara: {status:"sealed"} (auto/manual). Reset = hapus doc saja.
// - Permanen: {status:"final", files:{zipUrl,sizeBytes,finalizedAt,finalizedBy}}
//   + file di backups/YYYY-MM/. Reset permanen = hapus file + doc + tandai
//   archive_resets/YYYY-MM agar auto-seal tak membuatnya ulang.
// Data sumber (journals/attendances) TIDAK PERNAH dihapus di semua tingkat.
export type ArchiveFiles = {
  zipUrl: string; sizeBytes: number; finalizedAt: string; finalizedBy: string;
};
export type ArchiveDoc = {
  month: string; dari: string; sampai: string;
  counts: BackupStats; createdBy: string; createdAt: string;
  status: "sealed" | "final"; files?: ArchiveFiles;
};

// "final" hanya bila ada files.zipUrl — selain itu "sealed".
export function sealStatus(a: any): "sealed" | "final" {
  return a?.status === "final" ? "final" : "sealed";
}
export function sealFiles(a: any): ArchiveFiles | null {
  const f = a?.files as ArchiveFiles | undefined;
  return sealStatus(a) === "final" && f?.zipUrl ? f : null;
}
