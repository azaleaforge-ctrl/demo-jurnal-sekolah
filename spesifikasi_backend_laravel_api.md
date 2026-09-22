# Spesifikasi Teknis Backend (Laravel 11 API)

## Aplikasi Jurnal & Absensi Guru Modern

---

## 1. Stack Teknologi & Package Backend

* **Framework:** Laravel 11 (API Mode)
* **Autentikasi:** Laravel Sanctum (Token-Based Authentication)
* **Database Target:** Firebase Firestore (Demo Mode via SDK `kreait/laravel-firebase`)
* **Excel Generator + Import:** `maatwebsite/excel` (export `.xlsx` berstyled + import `.xlsx` via `ToCollection`/`WithHeadingRow`)
* **CSV Import:** `league/csv` (atau `fgetcsv` native) — format dipetakan ke kolom yang sama dengan template Excel
* **PDF Generator:** `barryvdh/laravel-dompdf` atau `spatie/laravel-pdf` (Browsershot)
* **File Storage:** disk `public` (surat sakit: pdf/jpg/jpeg/png, maks 2 MB) — URL publik disimpan di Firestore; foto jurnal & TTD disimpan sebagai URL (atau base64 data-URL PNG bila memakai storage eksternal)
* **Data Validation:** Laravel Form Request Validation (`required_if`, custom `Rule` untuk TTD kosong)
* **Mode Trial (pengganti Laravel saat ujicoba):** Firebase Web SDK langsung dari frontend —
  Firestore (semua koleksi §2, nama & field 1:1) + UploadThing (SEMUA media: foto, TTD, surat) + Firestore hanya simpan URL — lihat §5.
  Auth trial = validasi email vs koleksi `users` (tanpa password; password aktif saat backend Laravel).

---

## 2. Skema Database NoSQL (Firebase Firestore Structure)

> **Satu sumber kebenaran:** `journals` + `student_attendances` yang ditulis guru via `POST /journals`
> otomatis terbaca Admin ( §3B-dashboard ) dan Kepala Sekolah ( §3D ) — tanpa duplikasi/tabel bayangan.
> Setiap dokumen memakai `created_at` / `updated_at` (server timestamp, format `YYYY-MM-DD HH:MM:SS`).

```text
├── school_settings (Document Tunggal)
│   ├── school_name: string
│   ├── academic_year: string
│   └── semester: string (ganjil / genap)
│
├── users (Collection)
│   ├── id: string
│   ├── name: string
│   ├── email: string (namaguru@namasekolah.id)
│   ├── role: string (admin / guru / kepsek)
│   ├── password: string (hashed)
│   ├── subject_ids: array [string] (hanya untuk role guru)
│   ├── created_at: timestamp
│   └── updated_at: timestamp
│
├── classes (Collection)
│   ├── id: string
│   ├── name: string (contoh: "X RPL 1")
│   ├── created_at: timestamp
│   └── updated_at: timestamp
│
├── subjects (Collection - Mapel)
│   ├── id: string
│   ├── name: string
│   ├── code: string
│   ├── created_at: timestamp
│   └── updated_at: timestamp
│
├── materials (Collection - ATP/Materi)
│   ├── id: string
│   ├── subject_id: string
│   ├── title: string
│   ├── created_at: timestamp
│   └── updated_at: timestamp
│
├── schedules (Collection - Jam Pelajaran = SLOT MENGAJAR GURU)
│   ├── id: string
│   ├── name: string (contoh: "Jam 1 (07.00 - 07.45)")
│   ├── order: number
│   ├── created_at: timestamp
│   └── updated_at: timestamp
│
├── students (Collection — TANPA konsep jam/sesi masuk)
│   ├── id: string
│   ├── nisn: string (unik per sekolah, key dedup saat import)
│   ├── name: string
│   ├── class_id: string (satu-satunya penentu daftar absensi)
│   ├── created_at: timestamp
│   └── updated_at: timestamp
│
├── journals (Collection — sekaligus ABSENSI GURU per sesi mengajar)
│   ├── id: string
│   ├── teacher_id: string
│   ├── class_id: string
│   ├── subject_id: string
│   ├── schedule_id: string (slot/shift MENGAJAR guru — bukan sesi siswa)
│   ├── material_id: string (opsional)
│   ├── custom_material: string (opsional)
│   ├── notes: text
│   ├── photo_url: string (sisi panjang maks 1280px, lihat §4.7)
│   ├── signature_url: string (PNG data-URL ternormalisasi 600×200 — tidak boleh kanvas kosong, lihat §4.2)
│   ├── teacher_status: string (hadir / izin / sakit — kehadiran guru sesi ini)
│   ├── leave_note: string nullable (WAJIB jika teacher_status = izin)
│   ├── sick_letter_url: string nullable (WAJIB jika teacher_status = sakit — scan/foto surat klinik/RS)
│   ├── sick_letter_note: string nullable (keterangan surat sakit — opsional, sangat dianjurkan)
│   ├── date: date (YYYY-MM-DD)
│   ├── semester: string
│   ├── created_at: timestamp (jam submit — dasar feed "jurnal masuk terbaru")
│   └── updated_at: timestamp
│
└── student_attendances (Collection — TANPA dimensi jam; ikut kelas+jurnal)
    ├── id: string
    ├── journal_id: string
    ├── student_id: string
    ├── status: string (hadir / sakit / izin / alpha)
    ├── created_at: timestamp
    └── updated_at: timestamp
```

> **Aturan domain:** siswa tidak punya jam/sesi masuk. Daftar absensi sebuah jurnal SELALU =
> seluruh siswa `where class_id = journals.class_id`. `schedules` hanya dibaca/dipilih
> sebagai slot mengajar guru (`journals.schedule_id`). Tidak ada filter, pilihan, atau
> kolom jam di sisi siswa — kolom "Jam" di rekap/export adalah konteks slot guru.

### Kontrak Kolom Import (dipakai Admin + validasi row-level)

* **Template Siswa** (`GET /api/v1/admin/students/template` → `.xlsx`): kolom `nisn | nama | kelas`
  (kelas dicocokkan ke `classes.name`; baris dengan kelas tak dikenal ditolak dengan pesan baris).
* **Template Guru** (`GET /api/v1/admin/users/import-template` → `.xlsx`): kolom `nama | email | mapel`
  (email kosong → auto-generate pola `namaguru@namasekolah.id`; mapel dicocokkan ke `subjects.code/name`, boleh multi dipisah `;`).
* Respons import sukses-sebagian: `200 { imported: number, skipped: number, errors: [{ row: number, message: string }] }`.

---

## 3. Desain API Endpoints (Laravel Route Structure)

### A. Authentication API (`/api/v1/auth`)

* `POST /login` - Otentikasi pengguna dan penerbitan Sanctum Token.
* `POST /logout` - Revoke token otentikasi.
* `GET /me` - Mendapatkan data profil dan peran pengguna aktif.

### B. Admin Master Data + Dashboard API (`/api/v1/admin`) — middleware `auth:sanctum`, `role:admin`

* `GET|POST /school-settings` - Mengatur nama sekolah & semester.
* `GET|POST /users?role=guru|kepsek|admin` - List & buat akun (termasuk **akun Kepala Sekolah**: body `{ name, email, role: "kepsek", password }`).
* `PUT /users/{id}` - Edit akun (nama, email, role, `subject_ids` untuk guru).
* `DELETE /users/{id}` - Hapus akun (tolak jika menghapus akun sendiri; hapus juga token Sanctum miliknya).
* `POST /users/generate-teacher` - Generate otomatis akun guru (`nama@namasekolah.id`, password random → kembalikan plaintext sekali saja).
* `POST /users/import-teachers` - Import guru via `multipart file (.xlsx/.csv)`, validasi per baris, dukung email auto-generate.
* `GET /users/import-template` - Unduh template Excel import guru.
* `PUT /users/{id}/password` - Reset/ubah password (`{ password, password_confirmation }`, min 8).
* `GET|POST|PUT|DELETE /classes` - Master Data Kelas.
* `GET|POST|PUT|DELETE /subjects` - Master Data Mapel.
* `GET|POST|PUT|DELETE /materials` - Master Data ATP/Materi.
* `GET|POST|PUT|DELETE /schedules` - Master Data Jam Pelajaran (slot/shift mengajar guru).
* `GET|POST|PUT|DELETE /students` - Master Data Siswa (manual, per kelas — tanpa jam).
* `POST /students/import` - Import siswa via `multipart file (.xlsx/.csv)`, dedup by `nisn`, validasi `class_id` per baris.
* `GET /students/template` - Unduh template Excel import siswa.
* `GET /dashboard-stats?bulan=YYYY-MM` - Dashboard eksekutif admin (lebih detail dari kepsek):
  `{ guru: { hadir, izin, sakit, belum_isi }, siswa: { hadir, sakit, izin, alpha }, per_teacher: [{ teacher_id, name, submitted_today, teacher_status }], per_class: [{ class_id, name, hadir, sakit, izin, alpha }] }`.
  `belum_isi` = guru tanpa `journals` pada hari berjalan (lihat §4.6).
* `GET /journals-feed?tanggal_dari&sampai&class_id&teacher_id` - Feed "jurnal masuk terbaru":
  array jurnal (guru, kelas, mapel, tanggal, `teacher_status`, `leave_note`, `sick_letter_url`, `photo_url`, `signature_url`, ringkasan absensi siswa), urut `created_at` desc, paginasi `?page&per_page=20`.

### C. Guru Journal API (`/api/v1/teacher`) — middleware `auth:sanctum`, `role:guru`

> Satu `POST /journals` = **satu jurnal + absensi guru sesi itu + absensi siswa**. Format `multipart/form-data`.
> Hasilnya langsung terbaca Admin (§3B) dan Kepsek (§3D) — tidak ada endpoint sinkronisasi terpisah.

* `GET /schedules` - Mengambil daftar slot jam mengajar guru.
* `GET /students?class_id={id}` - Mengambil SELURUH siswa satu kelas (daftar absensi jurnal — tanpa filter jam).
* `POST /journals` - Field:
  * `class_id, subject_id, schedule_id, date, semester` - required, exists (`schedule_id` = slot mengajar guru).
  * `material_id` (nullable, exists) **xor** `custom_material` (nullable, string) — minimal salah satu terisi.
  * `notes` - required, string.
  * `photo` - required, image (jpg/jpeg/png), max 5120 KB (frontend sudah auto-compress + batasi sisi panjang 1280px, lihat §4.7).
  * `signature_data` - required, string data-URL PNG **ternormalisasi 600×200** (`data:image/png;base64,...`) — frontend mengunci via tombol "Simpan TTD" eksplisit sebelum submit — **wajib lolos Rule anti-kanvas-kosong** (lihat §4.2).
  * `teacher_status` - required, `in:hadir,izin,sakit`.
  * `leave_note` - `required_if:teacher_status,izin`.
  * `sick_letter` - `required_if:teacher_status,sakit`, file pdf/jpg/jpeg/png max 2048 KB → disimpan ke disk `public/surat-sakit`, URL-nya ke `sick_letter_url`.
  * `sick_letter_note` - nullable string (dianjurkan).
  * `attendances` - required array `{ student_id, status: hadir|sakit|izin|alpha }`, mencakup seluruh siswa kelas (frontend default Hadir) — tanpa dimensi jam.
* `GET /journals/history` - Riwayat jurnal pribadi guru (sertakan `photo_url`, `signature_url`, `teacher_status`, rekap absensi siswa per jurnal).

### D. Kepala Sekolah & Analytics API (`/api/v1/principal`) — middleware `auth:sanctum`, `role:kepsek,admin`

* `GET /dashboard-stats?bulan=YYYY-MM` - Ringkasan **ganda**: (1) kehadiran siswa (hadir/sakit/izin/alpha dari `student_attendances`), (2) kehadiran guru (`teacher_status` dari `journals`).
* `GET /journals-detailed?tanggal_dari&sampai&class_id&teacher_id` - Rekap komprehensif: jurnal + `teacher_status`/`leave_note`/`sick_letter_url` + agregat absensi siswa.

### E. Export API (`/api/v1/export`)

* `GET /rekap-pdf?tipe=guru|siswa&...` - Stream PDF profesional (header sekolah, tabel presisi, kolom status kehadiran guru + TTD digital; kolom "Jam" = slot mengajar guru).
* `GET /rekap-excel?tipe=guru|siswa&...` - File `.xlsx` asli (header berwarna, border, total otomatis).

---

## 4. Logika Bisnis & Validasi Server-Side

1. **Form Request `StoreJournalRequest`:**
   * Aturan kondisional inti: `'leave_note' => 'required_if:teacher_status,izin'`, `'sick_letter' => 'required_if:teacher_status,sakit|file|mimes:pdf,jpg,jpeg,png|max:2048'`.
   * `material_id`/`custom_material`: `required_without` silang agar materi selalu terisi salah satunya.
   * `attendances.*.student_id` harus `exists` dan `distinct`; jumlahnya harus sama dengan jumlah siswa kelas (cegah absensi setengah); tidak ada validasi jam di sisi siswa.
2. **Rule Anti-TTD-Kosong (`NotBlankSignature`):**
   * Kanvas kosong yang di-`toDataURL()` menghasilkan PNG bervolume kecil & seragam — Rule menolak `signature_data` yang: bukan data-URL PNG valid, **atau** panjang base64 di bawah ambang batas (contoh `< 2500` karakter), **atau** gagal `base64_decode`.
   * Kontrak frontend (hasil perbaikan bug "sudah digambar tapi terbaca kosong"): TTD digambar → dikunci via tombol **"Simpan TTD"** eksplisit → dinormalisasi ke kanvas tetap **600×200** (bg putih, contain, center) → data-URL disimpan di state → data-URL itulah yang dikirim sebagai `signature_data` (bukan baca kanvas live saat submit, karena kanvas di-unmount saat wizard pindah langkah). Respons `422 { errors: { signature_data: [...] } }` agar frontend menampilkan shake + toast yang tepat.
3. **Validasi Import (Siswa & Guru):**
   * File: `required|file|mimes:xlsx,csv,txt|max:5120`; gunakan `WithHeadingRow` + `SkipsOnFailure`; kembalikan error per baris `{ row, message }` tanpa menggagalkan seluruh file (import parsial + laporan).
   * Siswa: `nisn` required+unik (skip duplikat dengan laporan), `kelas` wajib cocok `classes.name`.
   * Guru: `nama` required; email unik bila diisi, auto-generate bila kosong; password awal random 10 karakter (kembalikan daftar kredensial sekali saja di respons).
4. **Manajemen Akun (Admin):**
   * `role` dibatasi `in:admin,guru,kepsek`; email unik di `users`; larangan hapus diri sendiri (`403`); penghapusan user mencabut token Sanctum-nya.
5. **Generasi PDF & Spreadsheet (.xlsx):**
   * **PDF Export:** template Blade HTML terstruktur rapi dengan header sekolah, tabel presisi, kolom status kehadiran guru + `leave_note`, serta layout tanda tangan digital.
   * **Excel Export:** `maatwebsite/excel` dengan class `FromView`/`WithHeadings` agar output `.xlsx` asli lengkap dengan warna header, border tabel, dan kalkulasi total otomatis (satu sheet kehadiran guru, satu sheet kehadiran siswa).
6. **Aliran Data Jurnal → Admin & Kepsek (tanpa endpoint sinkronisasi):**
   * `POST /journals` menulis `journals` + `student_attendances` dalam satu transaksi logis (tulis journal dulu, lalu batch attendances dengan `journal_id`-nya; bila batch gagal, hapus journal — kompensasi manual karena Firestore tanpa transaksi multi-koleksi lintas SDK).
   * Admin & Kepsek membaca koleksi yang **sama** (`GET /admin/dashboard-stats`, `GET /admin/journals-feed`, `GET /principal/dashboard-stats`, `GET /principal/journals-detailed`) — tidak ada tabel rekap/duplikat.
   * Firestore tanpa JOIN: agregasi (`per_teacher`, `per_class`, `belum_isi`) dihitung di PHP — ambil `users where role=guru`, `journals where date in range`, dan `student_attendances where journal_id in [...]`, lalu gabungkan di memori (batasi rentang ≤ 31 hari per request).
   * `belum_isi` (guru belum isi jurnal hari ini) = `users(role=guru)` minus `teacher_id` yang muncul di `journals where date=today`.
7. **Normalisasi Media (kontrak dengan frontend):**
   * Foto: sisi panjang maks **1280px** (frontend kompres via `browser-image-compression` sebelum upload; backend tolak `photo > 5120 KB`).
   * TTD: PNG data-URL **600×200** (frontend normalisasi via kanvas tetap; backend cukup validasi via Rule §4.2 — tanpa cek dimensi).
   * Surat sakit: pdf/jpg/jpeg/png maks 2048 KB di `public/surat-sakit`; nama file `{teacher_id}_{YYYY-MM-DD}_{uniqid}.{ext}`.

## 5. Mode Trial Firebase (pengganti Laravel saat ujicoba)

> Tujuan: semua fitur frontend berfungsi end-to-end (CRUD, jurnal, dashboard, export)
> tanpa server Laravel, dengan kontrak data IDENTIK §2. Project: `junal-sekolah`
> (config via env `NEXT_PUBLIC_FIREBASE_*`). Wajib aktifkan Firestore + Storage di console
> dan pasang rules demo (`allow read, write: if true` + peringatan hanya-ujicoba).

* **Koleksi 1:1** — `school_settings, users, classes, subjects, materials, schedules, students, journals, student_attendances`
  (nama dokumen/koleksi & field sama persis §2; `created_at/updated_at` ISO string client).
* **Pemetaan endpoint → operasi Firestore/Storage:**
  * Auth `POST /login` → `users where email == input` (harus ada; role ikut data user).
  * Admin CRUD (`/users`, `/classes`, `/subjects`, `/materials`, `/schedules`, `/students`, `/school-settings`)
    → `addDoc/setDoc/updateDoc/deleteDoc` koleksi terkait (UI wajib ada untuk semua, termasuk `/admin/kelas` + tombol Tambah Kelas di `/admin/siswa`).
  * Import (`/students/import`, `/users/import-teachers`) → `writeBatch` (maks 500/batch) + laporan `{ imported, skipped, errors[] }` yang sama.
  * `POST /journals` → SEMUA media ke **UploadThing** dulu, Firestore hanya simpan URL:
    `photo` (FileRouter `imageUploader`) → `photo_url`; `signature_data` (PNG 600×200, route image) → `signature_url`;
    `sick_letter` (route dokumen: pdf/jpg/jpeg/png) → `sick_letter_url`.
    Fallback Firebase Storage (`jurnal/`, `ttd/`, `surat-sakit/`) bila token kosong/upload gagal.
    → tulis `journals` + batch `student_attendances` (kompensasi hapus bila batch gagal, lih. §4.6).
    Token via env server `UPLOADTHING_TOKEN` (jangan commit).
  * Dashboard/feed (`/admin/dashboard-stats`, `/admin/journals-feed`, `/principal/*`) → query Firestore
    (`where date in range`, `orderBy created_at desc`, limit 20/page) + agregasi client (aturan hitung §4.6).
  * Export (`/export/*`) → generate client dari feed (Excel styled + PDF kop) selama backend Laravel mati.
* **Seed demo realistis** (via tombol "Isi Data Demo" di Pengaturan, idempotent — skip bila koleksi sudah berisi):
  6 kelas × ±30 siswa (nama Indonesia asli, NISN unik), ±14 guru sesuai mapel + 1 admin + 1 kepsek,
  ±10 mapel berkode, 3–4 materi per mapel, 8 slot jam, `school_settings` terisi.
* **Batasan trial jujur:** tanpa password (login cek email), tanpa validasi server (client menegakkan §4),
  rules terbuka khusus ujicoba — naik ke Laravel + Sanctum untuk produksi.
