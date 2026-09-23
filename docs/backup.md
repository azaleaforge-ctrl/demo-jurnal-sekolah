# Backup Bulanan (soft-archive)

Prinsip: dashboard/export hanya tampilkan bulan **berjalan**
(feed realtime `since = YYYY-MM-01`).
Urutan halaman Backup: filter/picker + tombol aksi → **Tabel Arsip Sementara**
→ pratinjau + **Tabel Backup Data Bulanan**. `journals` + `student_attendances`
asli **tidak pernah dihapus**.

## Tabel A — Arsip Sementara (`temp_archives/temp-YYYY-MM-<timestamp>`)

Salinan (snapshot counts) bulan yang sedang dilihat — **boleh bulan berjalan**;
satu bulan boleh punya beberapa arsip (id unik per waktu).

| field | isi |
|---|---|
| doc id | `temp-YYYY-MM-<timestamp>` |
| `month` / `dari` / `sampai` | bulan yang disalin |
| `counts` | `{ journals, hadir, sakit, izin, alpha, teachers, classes }` saat tombol ditekan |
| `createdBy` / `createdAt` | pembuat + waktu salin |

- Tombol **Arsip Sementara** (admin, ganti nama+fungsi tombol Arsipkan lama):
  tanpa larangan bulan berjalan. Hanya menulis copy.
- **Hapus** per baris (admin) = hapus doc copy itu saja; sumber utuh.
- **Unduh** per baris = regenerate ZIP dari feed bulan itu.
- Auto-seal **tidak menyentuh** arsip sementara manual (koleksi terpisah).
- Kepsek: lihat + unduh, tanpa hapus.

## Tabel B — Backup Data Bulanan (`archives/YYYY-MM`)

Hanya bulan **lewat** yang tersegel (auto-seal `system-auto` saat halaman
dibuka + permanen). Kolom Status: Sementara / Permanen.

| field | sementara (`sealed`) | permanen (`final`) |
|---|---|---|
| `month` | `YYYY-MM` (doc id) | sama |
| `dari` / `sampai` | `YYYY-MM-01` s/d hari terakhir | sama |
| `counts` | `{ journals, hadir, sakit, izin, alpha, teachers, classes }` | sama |
| `createdBy` | email admin / `"system-auto"` | sama (pembuat segel awal) |
| `createdAt` | `YYYY-MM-DD HH:mm:ss` | sama |
| `status` | `"sealed"` | `"final"` |
| `files` | — | `{ zipUrl, sizeBytes, finalizedAt, finalizedBy }` |

File permanen di Storage: `backups/YYYY-MM/Backup-{Bulan Tahun}.zip`
(`backupStoragePath`, upload via `uploadBlob` existing di `db.ts`).

- **Tingkat 1 — sementara (bulanan)**: auto-seal (tanpa cron, saat halaman
  Backup dibuka admin/kepsek: bulan lewat + berdata + belum disegel + tidak di
  `archive_resets`). Reset = `deleteDoc` segel saja (auto-seal bisa membuatnya
  lagi selama datanya ada). **Unduh** per baris = regenerate ZIP.
- **Tingkat 2 — permanen**: admin tekan **Simpan Permanen** pada baris
  tersegel → ZIP digenerate → upload Storage → segel jadi `final` + `files`.
  Tombol unduh memakai `zipUrl` langsung (instan, tanpa generate ulang) +
  badge **Permanen** (admin & kepsek).
- **Reset permanen** (admin): konfirmasi ganda → hapus file Storage +
  hapus doc segel + tulis `archive_resets/YYYY-MM`
  `{month, resetAt, resetBy, level:"final"}` agar auto-seal melewatinya
  selamanya (tidak dibuat ulang).
- **Kepsek**: read-only — unduh regenerate (sementara) / direct link
  (permanen); tanpa tombol permanen/reset.
- Data sumber (`journals`/`student_attendances`) **tidak pernah dihapus**
  di semua tingkat.

- Satu tombol unduh menghasilkan 1 file (`buildMonthZip`, `jszip`,
  client-side) dengan struktur:
  ```
  Backup-{Bulan Tahun}.zip
  └── {Bulan Tahun}/            (mis. "Agustus 2026", via backupFolder)
      ├── Guru/
      │   └── {Nama Guru}/
      │       ├── 00-Rekap-Bulanan-{Nama}.xlsx  (+ .pdf, prefix 00 = paling atas)
      │       └── Harian/
      │           ├── Excel/{YYYY-MM-DD}-{Nama}.xlsx (hanya tanggal berdata)
      │           └── PDF/{YYYY-MM-DD}-{Nama}.pdf
      └── Siswa/
          └── {Nama Kelas}/
              ├── 00-Rekap-Bulanan-{Kelas}.xlsx (+ .pdf)
              └── Harian/
                  ├── Excel/{YYYY-MM-DD}-{Kelas}.xlsx
                  └── PDF/{YYYY-MM-DD}-{Kelas}.pdf
  ```
  File bulanan ikut builder Export Center (`buildRekapExcel` /
  `buildRekapPdfAsync`, `periode: "bulanan"`, boleh embed foto); file harian
  (`periode: "harian"`, xlsx+pdf) tanpa foto embed agar ringan — kolom jadi
  "Ada" (via placeholder `data:,no-fetch` yang dilewati `fetchMedia`).
  Nama guru/kelas disanitasi (`sanitizeName`: buang `/ \ : * ? " < > |`).
  Popup progres "Mohon tunggu, backup sedang berjalan": n/total file,
  akumulasi ukuran, ETA dinamis (sisa file / file-per-detik → "estimasi
  ±X mnt/dtk"; fallback teks 1–3 menit sebelum terukur), sekuensial + yield
  tiap file agar UI tak freeze. Tombol **Batal** menghentikan loop
  (`BackupCancelledError` via `shouldAbort`, dicek tiap file + tiap yield):
  modal tertutup, toast "Unduhan dibatalkan", tanpa file setengah jadi.
  Semua tombol Unduh nonaktif (`busy`) selama proses berjalan.
  Sebelum unduh tampil estimasi ukuran
  (`estimateMonthZip`: overhead/file + per jurnal + per absensi); ukuran ZIP
  final (MB) tampil di toast setelah jadi.
  `downloadRekap` tidak dipakai langsung karena mengunci 1 guru / 1 kelas (§3E).

## Aturan urut + Waktu Isi (export.ts, berlaku juga untuk ZIP)

- Kolom **Waktu Isi** (HH:MM dari `created_at`, fallback `00:00` bila kosong)
  ada di semua tabel ber-butir jurnal: rekap guru harian/mingguan/bulanan
  (excel+pdf), rekap siswa detail/agregat (excel+pdf), dan file ZIP backup
  (harian+bulanan, ikut builder yang sama). Baris agregat murni
  (angka per siswa, TOTAL, Total Keseluruhan) berisi `-`/kosong.
  `created_at` hanya dibaca — builder tak pernah menulis/menimpanya; format
  + blok TTD tidak berubah (merge kanan meta/TTD menyesuaikan 10 kolom).
- Tertib final: kelompok **nama A–Z** (locale `id`, case-insensitive) lalu
  **terbaru dulu** (`created_at` desc → `date` desc → `id` desc) via
  `sortJournalRows`/`compareJournalNewest` di `filterRekap`, ketiga builder
  (`buildRekapExcel`, `buildRekapPdf`, `buildRekapPdfAsync`), dan
  `groupMonth` backup (grup guru/kelas A–Z, isi terbaru dulu).
  Daftar siswa per baris dan agregat per kelas sudah A–Z sejak lama.

## Konfirmasi popup (tanpa window.confirm)

Satu state `confirm` + komponen `Modal` existing per halaman. Audit aksi:

| Aksi | Popup | Tombol |
|---|---|---|
| Hapus arsip sementara/baris (admin) | "Hapus arsip sementara?" + nama baris + "salinan ini akan dihapus, data sumber tetap aman" | Batal / Ya, Hapus (danger) |
| Batal saat unduh berjalan (admin+kepsek) | "Batalkan unduhan? … Progres akan hilang" | Lanjut Unduh (= tutup popup, progres jalan terus) / Ya, Batalkan |
| Arsip Sementara (admin) | "Buat arsip sementara?" + bulan + jumlah jurnal | Batal / Ya, Simpan |
| Simpan Permanen (admin) | "Simpan permanen?" + bulan + upload Storage | Batal / Ya, Simpan |
| Reset segel sementara (admin) | "Hapus segel arsip?" + sumber utuh | Batal / Ya, Hapus (danger) |
| Reset permanen (admin) | ganda dipertahankan: "Hapus permanen?" → "Yakin hapus permanen?" | Batal / Lanjut → Batal / Ya, Hapus Permanen (danger) |

Kepsek read-only: hanya popup Batal unduh.

## Uji manual (sementara → bulanan → permanen → reset)

1. Admin → **Backup** → **Lihat** bulan berjalan → **Arsip Sementara**
   (dulu "Arsipkan") → baris baru di tabel Arsip Sementara (boleh diulang —
   satu bulan bisa beberapa). Hapus satu baris → copy hilang, sumber utuh.
2. Bulan lewat berdata tersegel otomatis (tabel Backup Data Bulanan,
   badge "auto"). Unduh per baris → regenerate ZIP.
3. Baris tersegel → **Permanen** → popup + "Mengunggah…" → badge **Permanen**;
   unduh per baris jadi instan. Cek `archives/YYYY-MM` + Storage
   `backups/YYYY-MM/…`.
4. Kepsek → dua tabel tampil; unduh bisa; tanpa tombol arsip/hapus/permanen/reset.
5. **Reset** baris permanen → konfirmasi ganda → file+doc hilang +
   `archive_resets/YYYY-MM` → tidak dibuat ulang. Reset baris sementara →
   doc hilang, auto-seal bisa membuatnya lagi.
6. Data `journals`/`student_attendances` tetap ada di semua langkah.
7. Batal: unduh bulan besar → tekan **Batal** → popup "Yakin batalkan
   unduhan? Progres akan hilang" → **Lanjut Unduh** = popup (bukan progres)
   tertutup, unduhan terus jalan; **Ya, Batalkan** = toast "Unduhan
   dibatalkan", modal tertutup, tidak ada file terunduh.
8. Tiap aksi hapus/batal/destruktif = popup Modal (cek: tanpa window.confirm
   di kedua halaman).
9. `npm run build` lolos.
