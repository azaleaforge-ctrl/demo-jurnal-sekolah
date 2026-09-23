"use client";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { Table } from "@/src/components/ui/table";
import { PSection, PSteps, PAcc, PNote, SistemHarian, SistemArsip } from "@/src/components/panduan";

export default function AdminCaraPakai() {
  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Cara Pakai & Sistem" hint="Panduan kelola data, pantau jurnal, dan arsip bulanan">
        <Card className="min-w-0">
          <h2 className="font-display font-bold">Tugas harian admin</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Admin menyiapkan data master (siswa, guru, kelas, mapel, jam, materi, akun),
            memantau jurnal yang masuk tiap hari lewat dashboard, dan mengarsip bulan lewat lewat menu Backup.
          </p>
        </Card>

        <PSection title="Alur harian yang disarankan" hint="Pagi cek, siang ingatkan, sore pantau">
          <PSteps items={[
            { title: "Pagi: buka Dashboard", desc: "Lihat kartu Sudah isi dan Belum isi untuk tanggal hari ini. Grafik dan tabel selalu mulai dari hari ini agar ringan." },
            { title: "Siang: ingatkan guru yang belum isi", desc: "Tabel Status per guru menunjukkan siapa yang belum mengisi hari ini. Tekan Lihat untuk melompat ke jurnal guru itu." },
            { title: "Sore: pastikan rekap siap", desc: "Bila ada permintaan laporan, buka Export Center, pilih tipe dan periode, lalu unduh Excel atau PDF." },
            { title: "Awal bulan: arsipkan bulan lewat", desc: "Buka menu Backup, pilih bulan lewat yang berdata, tekan Lihat lalu Arsip Sementara. Simpan Permanen bila file ZIP sudah final." },
          ]} />
        </PSection>

        <PSection title="Kelola data master" hint="Menu Siswa, Guru, Kelas, Mapel, Jam, Materi, Akun">
          <Table head={["Menu", "Kegunaan", "Catatan"]}>
            <tr className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-semibold">Siswa</td>
              <td className="px-4 py-3">Tambah, ubah, hapus, cari siswa</td>
              <td className="px-4 py-3">Impor massal dari Excel/CSV dengan kolom nisn, nama, kelas; NISN ganda dilewati otomatis</td>
            </tr>
            <tr className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-semibold">Guru</td>
              <td className="px-4 py-3">Tambah, ubah, hapus, cari guru</td>
              <td className="px-4 py-3">Impor massal kolom nama, email, mapel; email kosong dibuat otomatis; password dibuat acak</td>
            </tr>
            <tr className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-semibold">Akun</td>
              <td className="px-4 py-3">Generator akun login guru</td>
              <td className="px-4 py-3">Bagikan email dan password awal ke guru yang bersangkutan</td>
            </tr>
            <tr className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-semibold">Kelas, Mapel, Jam, Materi</td>
              <td className="px-4 py-3">Data pendukung form jurnal guru</td>
              <td className="px-4 py-3">Lengkapi sebelum tahun ajaran berjalan agar guru bisa mengisi</td>
            </tr>
          </Table>
        </PSection>

        <PSection title="Dashboard harian dan grafik" hint="Query sempit satu tanggal">
          <div className="space-y-2 text-sm leading-relaxed text-slate-600">
            <p>Dashboard membuka <b>tanggal hari ini</b> dengan tombol sebelum/sesudah, date-picker, dan tombol Hari ini. Kartu statistik, grafik batang, dua diagram lingkaran, tabel per guru, agregat per kelas, dan daftar jurnal dihitung dari snapshot hari itu.</p>
            <p>Grafik dirender setelah data pertama tiba. Hari kosong menampilkan angka nol dan pesan yang jelas, bukan loading tanpa akhir.</p>
          </div>
        </PSection>

        <PSection title="Export Center" hint="Rekap resmi berkop sekolah">
          <div className="space-y-2 text-sm leading-relaxed text-slate-600">
            <p>Pilih tipe rekap (Guru atau Siswa), periode (harian, mingguan, bulanan), lalu <b>wajib</b> pilih satu guru untuk rekap guru atau satu kelas untuk rekap siswa. Unduh Excel untuk olah lanjut atau PDF untuk laporan resmi.</p>
          </div>
        </PSection>

        <PSection title="Backup bulanan" hint="Lihat, Arsip Sementara, Simpan Permanen, Reset, popup progres">
          <PSteps items={[
            { title: "Lihat", desc: "Pilih bulan lalu tekan Lihat untuk pratinjau statistik dan daftar jurnal bulan itu." },
            { title: "Arsip Sementara", desc: "Menyalin data bulan berjalan atau bulan terpilih ke Tabel Arsip Sementara. Salinan boleh dihapus kapan saja; yang hilang hanya salinannya, jurnal asli tetap utuh." },
            { title: "Simpan Permanen", desc: "Menjadikan bulan penuh sebagai backup resmi di Tabel Backup Data Bulanan, lengkap dengan file ZIP permanen. Tombol unduh sesudahnya instan tanpa generate ulang." },
            { title: "Reset", desc: "Menghapus arsip yang tidak dipakai lagi, dengan konfirmasi. Jurnal dan absensi asli tetap utuh." },
          ]} />
          <div className="mt-2">
            <PNote>Selama ZIP dibuat tampil popup progres: jumlah file, akumulasi ukuran, dan estimasi waktu. Jangan tutup halaman sampai selesai.</PNote>
          </div>
        </PSection>

        <SistemHarian />

        <SistemArsip />

        <PSection title="Pertanyaan umum">
          <PAcc items={[
            { q: "Guru lupa password, bagaimana?", a: "Buka menu Akun, cari guru itu, dan buat ulang kredensialnya. Sampaikan password baru secara langsung, jangan lewat grup umum." },
            { q: "Impor Excel gagal sebagian, apa yang terjadi?", a: "Baris valid diproses, baris bermasalah dilaporkan per baris (misal NISN kosong atau kelas tidak dikenal). Perbaiki file lalu impor ulang; duplikat dilewati otomatis." },
            { q: "Dashboard kosong padahal guru sudah mengisi?", a: "Pastikan tanggal terpilih sama dengan tanggal jurnal. Coba muat ulang halaman. Bila tetap kosong, cek koneksi: aplikasi memakai data lokal sebagai cadangan saat server tidak terjangkau." },
            { q: "Apa beda Arsip Sementara dan Backup Bulanan?", a: "Arsip Sementara adalah salinan kerja yang boleh dihapus (yang hilang hanya salinannya). Backup Data Bulanan adalah arsip resmi bulan penuh beserta file permanennya." },
            { q: "Arsip dihapus, apakah datanya hilang?", a: "Tidak. Yang dihapus hanya salinan atau file arsipnya; jurnal dan absensi asli tetap ada di database dan tetap bisa dilihat lewat tanggalnya." },
          ]} />
        </PSection>
      </AppShell>
    </Guard>
  );
}
