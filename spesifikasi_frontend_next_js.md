# Spesifikasi Teknis Frontend (Next.js)

## Aplikasi Jurnal & Absensi Guru Modern

---

## 1. Stack Teknologi & Tools Frontend

* **Framework:** Next.js 14/15 (App Router Mode)
* **UI Library & Styling:** Tailwind CSS v3/v4 + Shadcn UI
* **Animation Engine:** Framer Motion (untuk animasi slide, transisi halaman, dan modal)
* **Form & Validasi:** React Hook Form + Zod Schema Validation
* **Digital Signature:** `react-signature-canvas`
* **Camera & Media Compression:** `browser-image-compression` + HTML5 Camera Native API
* **Grafik & Analytics:** Recharts / Chart.js
* **Iconography:** Lucide React Icons
* **Notifications:** Sonner / Toastify (Toast feedback)

---

## 2. Layout & Responsive Design Strategy

Tampilan bersifat **Adaptive & Responsive**, menyesuaikan perangkat tanpa memisahkan codebase:

| Device | Layar Target | Pendekatan Layout UI / UX |
| :--- | :--- | :--- |
| **Mobile** | Handphone Guru (< 640px) | *App-like Fullscreen Flow*. Navigasi bottom bar, tombol interaksi besar (*touch-friendly*), slide wizard bertahap, modal sheet bottom-up. |
| **Tablet / iPad** | iPad Guru / Admin (640px - 1024px) | *Split-Screen Layout*. Panel kiri untuk form wizard/navigasi, panel kanan untuk *live preview* jurnal/absensi. |
| **Desktop** | PC Admin & Kepsek (> 1024px) | *Multi-Column Density Layout*. Sidebar navigasi kiri, statistik card grid di atas, tabel data luas dengan pencarian cepat & filter interaktif. |

---

## 3. Fitur UI/UX Berdasarkan Peran User (Role)

### A. Admin Sekolah
1. **Pengaturan Sekolah & Semester:**
   * Form ubah nama sekolah dan toggle status semester (Ganjil / Genap).
2. **Kelola Data Master (CRUD & Instant Search):**
   * Data Siswa, Data Guru, Data Mata Pelajaran (Mapel), Data Jam Pelajaran (bisa ditambah dinamis), Data ATP / Materi Pelajaran.
   * *Live Client-Side Search* untuk memfilter data pada tabel secara langsung.
   * *Confirmation Modal* dengan animasi peringatan sebelum menghapus data.
3. **Generator Akun Guru:**
   * Generasi akun otomatis dengan pola default: `namaguru@namasekolah.id`.
   * Modal khusus untuk edit password dan hapus akun guru.
4. **Export Center:**
   * Halaman unduh rekap kehadiran guru dan siswa dengan indikator proses (*Loading Progress Bar / Skeleton Loader*) saat memproses PDF/Excel.

### B. Guru
1. **Interactive Form Wizard Jurnal (4 Slide Step-by-Step):**
   * **Slide 1 - Kelas & Mapel:** Dropdown pilihan kelas dan mata pelajaran.
   * **Slide 2 - Jam & Materi:** Pilihan jam pelajaran yang telah ditentukan Admin, serta pilihan ATP/Materi (opsi isi manual jika materi tidak terdaftar).
   * **Slide 3 - Catatan, Foto & Tanda Tangan:**
     * Textarea kegiatan mengajar.
     * Fitur Kamera langsung (*Native Camera Access*) dengan auto-compress ukuran foto tanpa merusak ketajaman.
     * Canvas Tanda Tangan Digital (`react-signature-canvas`) dilengkapi tombol *Clear/Hapus*.
   * **Slide 4 - Absensi Siswa:**
     * Daftar siswa otomatis muncul berdasarkan kelas yang dipilih.
     * Radio button status: **Hadir** (Default), **Sakit**, **Izin**, **Alpha**.
     * Tombol "Simpan Jurnal" dengan validasi menyeluruh.
2. **Riwayat & Rekap Jurnal Guru:**
   * Melihat riwayat jurnal sebelumnya lengkap dengan foto bukti, materi, dan tanda tangan digital.
   * Tombol cetak PDF riwayat jurnal pribadi.

### C. Kepala Sekolah
1. **Executive Dashboard:**
   * Ringkasan statistik kehadiran siswa dan guru dalam bentuk diagram batang dan lingkaran (Recharts).
2. **Detail Audit Jurnal & Absensi:**
   * Tampilan *drill-down* rekapitulasi harian/bulanan kehadiran guru dan siswa secara menyeluruh.
   * Fitur ekspor laporan eksekutif PDF & Excel.

---

## 4. Aturan Validasi Form & Enhancement UX

1. **Validasi Tanda Tangan Digital:**
   * Jika canvas TTD masih kosong saat menekan tombol simpan, form memicu animasi *shake* pada canvas dan menampilkan *Toast Error*: **"Tanda tangan digital wajib diisi!"**.
2. **Kompresi Gambar Client-Side:**
   * Gambar dari kamera langsung dikompresi di memori browser pengguna menggunakan `browser-image-compression` sebelum dikirim ke server.
3. **Feedback UI & Toast Notifications:**
   * Pop-up notifikasi toast muncul setiap kali aksi **Simpan, Update, Hapus, atau Export** berhasil/gagal.
4. **Indikator Loading Export:**
   * Tombol unduh PDF/Excel menampilkan spinner loading & status disable untuk mencegah permintaan ganda (*double request*).