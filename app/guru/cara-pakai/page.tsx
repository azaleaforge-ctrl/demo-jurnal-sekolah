"use client";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { PSection, PSteps, PAcc, PNote, SistemHarian } from "@/src/components/panduan";

export default function GuruCaraPakai() {
  return (
    <Guard roles={["guru"]}>
      <AppShell role="guru" title="Cara Pakai & Sistem" hint="Panduan mengisi jurnal dan memakai aplikasi tiap hari">
        <Card className="min-w-0">
          <h2 className="font-display font-bold">Tugas harian guru</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Setiap hari mengajar, isi satu jurnal lewat menu Jurnal Baru. Jurnal yang tersimpan otomatis
            tercatat di sistem tanpa perlu kirim manual.
          </p>
        </Card>

        <PSection title="Beranda guru" hint="Ringkasan sekilas sebelum mengisi">
          <div className="space-y-2 text-sm leading-relaxed text-slate-600">
            <p>Menu Beranda menampilkan jumlah jurnal bulan ini dan jam mengajar pekan ini, plus jalan pintas ke Jurnal Baru. Cukup 1 menit dari HP untuk mengisi jurnal hari ini.</p>
          </div>
        </PSection>

        <PSection title="Alur harian yang disarankan" hint="Pagi mengisi, siang memantau, sore melengkapi">
          <PSteps items={[
            { title: "Pagi: isi Jurnal Baru", desc: "Selesai mengajar satu kelas, langsung isi 4 langkah: Kelas dan Mapel, Jam dan Materi, Foto dan TTD, Absensi. Jangan menumpuk sampai sore agar tidak lupa detail kegiatan." },
            { title: "Siang: cek Riwayat hari ini", desc: "Buka menu Riwayat untuk memastikan jurnal pagi sudah tersimpan lengkap dengan foto dan TTD. Bila ada absensi yang keliru, tekan Detail dan Ubah Absensi." },
            { title: "Sore: unduh bila perlu", desc: "Bila butuh arsip pribadi, tekan Export PDF di Riwayat untuk mengunduh rekap harian. File memakai kop sekolah dan blok tanda tangan resmi." },
          ]} />
        </PSection>

        <PSection title="Jurnal Baru: 4 langkah" hint="Data tersimpan otomatis per langkah">
          <PSteps items={[
            { title: "Langkah 1: Kelas dan Mapel", desc: "Pilih kelas, mapel, dan status kehadiran diri sendiri. Bila izin, keterangan izin wajib diisi. Bila sakit, surat klinik atau RS wajib diunggah (pdf, jpg, atau png, maksimal 2 MB)." },
            { title: "Langkah 2: Jam dan Materi", desc: "Pilih jam mulai dan jam selesai (jam selesai harus sesudah jam mulai), lalu isi materi atau ATP minimal 3 karakter. Bisa pilih dari daftar materi atau tulis manual." },
            { title: "Langkah 3: Foto dan TTD", desc: "Ambil foto bukti mengajar (dikompresi otomatis agar ringan) dan bubuhkan tanda tangan digital. TTD wajib diisi, kanvas kosong ditolak. Isi juga catatan kegiatan minimal 5 karakter." },
            { title: "Langkah 4: Absensi", desc: "Tandai kehadiran tiap siswa: Hadir, Sakit, Izin, atau Alpha. Daftar bisa dicari per nama. Simpan untuk mengirim jurnal." },
          ]} />
        </PSection>

        <PSection title="Riwayat harian" hint="Default hari ini, geser tanggal untuk hari lalu">
          <div className="space-y-2 text-sm leading-relaxed text-slate-600">
            <p>Riwayat selalu membuka <b>hari ini</b>. Pakai tombol sebelum dan sesudah, date-picker, atau tombol Hari ini untuk pindah tanggal. Tombol maju nonaktif saat sudah di hari ini.</p>
            <p>Hari ini kosong adalah hal wajar bila belum mengisi. Hari lalu menampilkan snapshot hari itu, lengkap dengan foto, materi, dan TTD. Kartu jurnal bisa dibuka untuk mengubah absensi siswa.</p>
          </div>
        </PSection>

        <SistemHarian />

        <PSection title="Pertanyaan umum">
          <PAcc items={[
            { q: "Saya salah tandai absensi, bagaimana mengubahnya?", a: "Buka Riwayat pada tanggal jurnal itu, tekan Detail dan Ubah Absensi, perbaiki status tiap siswa, lalu Simpan Absensi. Perubahan tersimpan ke server dan arsip lokal." },
            { q: "Foto gagal diunggah, apakah jurnal hilang?", a: "Tidak. Bila upload ke server gagal, aplikasi memakai penyimpanan cadangan dan memberi tahu lewat notifikasi. Jurnal tetap tersimpan." },
            { q: "Surat sakit format apa yang diterima?", a: "File pdf, jpg, jpeg, atau png dengan ukuran maksimal 2 MB. Tanpa surat, jurnal status sakit tidak bisa disimpan." },
            { q: "Bisakah mengisi jurnal untuk kemarin?", a: "Form Jurnal Baru selalu mengisi untuk hari ini. Bila kemarin terlewat, hubungi admin untuk pencatatan susulan." },
            { q: "Kenapa tombol tanggal maju nonaktif?", a: "Riwayat tidak bisa maju melewati hari ini. Tanggal besok yang kosong adalah hal wajar karena jurnalnya memang belum ada." },
          ]} />
        </PSection>

        <div className="mt-4">
          <PNote>Butuh bantuan teknis? Hubungi admin sekolah dengan menyebutkan email login dan tanggal jurnal yang bermasalah.</PNote>
        </div>
      </AppShell>
    </Guard>
  );
}
