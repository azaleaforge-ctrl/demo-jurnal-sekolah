"use client";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { PSection, PSteps, PAcc, PNote, SistemHarian, SistemArsip } from "@/src/components/panduan";

export default function KepsekCaraPakai() {
  return (
    <Guard roles={["kepsek"]}>
      <AppShell role="kepsek" title="Cara Pakai & Sistem" hint="Panduan pemantauan read-only untuk kepala sekolah">
        <Card className="min-w-0">
          <h2 className="font-display font-bold">Peran kepala sekolah: memantau</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Akun kepala sekolah bersifat <b>read-only</b>: bisa melihat semua data dan mengunduh laporan,
            tetapi tidak bisa menambah, mengubah, atau menghapus data apa pun.
          </p>
        </Card>

        <PSection title="Alur harian yang disarankan" hint="Pagi pantau, siang dalami, sore unduh bila perlu">
          <PSteps items={[
            { title: "Pagi: buka Dashboard", desc: "Lihat kartu Sudah isi dan Belum isi hari ini, grafik kehadiran, status per guru, dan agregat per kelas." },
            { title: "Siang: dalami per orang dan per kelas", desc: "Buka Rekap Guru untuk jurnal satu guru terpilih (lengkap dengan foto bukti) atau Rekap Siswa untuk kehadiran per siswa per kelas." },
            { title: "Sore: unduh bila perlu", desc: "Pakai Export Center untuk rekap resmi, atau menu Backup untuk mengunduh arsip bulan lewat." },
          ]} />
        </PSection>

        <PSection title="Fitur pemantauan" hint="Semua read-only, tanpa tombol tulis">
          <PSteps items={[
            { title: "Dashboard Eksekutif", desc: "Statistik harian, grafik batang kehadiran, diagram status guru dan siswa, tabel per guru dengan tombol Lihat, agregat per kelas, dan daftar jurnal terbaru." },
            { title: "Rekap Guru", desc: "Cari nama lalu pilih satu guru untuk melihat seluruh jurnalnya pada rentang hari, minggu, bulan, atau custom. Filter status Hadir dan Tidak hadir. Foto bukti bisa diperbesar; TTD guru disembunyikan untuk privasi." },
            { title: "Rekap Siswa", desc: "Filter kelas lalu pilih siswa (atau cari nama) untuk melihat baris kehadiran per tanggal: tanggal, nama, kelas, mapel, guru mapel, dan status hadir, sakit, izin, atau alpha." },
            { title: "Export Center", desc: "Unduh rekap Guru (wajib pilih satu guru) atau Siswa (wajib pilih satu kelas) dalam Excel atau PDF resmi berkop sekolah." },
            { title: "Backup", desc: "Unduh arsip bulan lewat dari Tabel Backup Data Bulanan (instan bila file permanen sudah ada) atau lihat salinan di Tabel Arsip Sementara. Tanpa tombol hapus dan tanpa tombol permanen." },
          ]} />
        </PSection>

        <SistemHarian />

        <SistemArsip />

        <PSection title="Pertanyaan umum">
          <PAcc items={[
            { q: "Kenapa TTD guru tidak tampil?", a: "Disengaja untuk privasi. Kepala sekolah tetap bisa menilai kegiatan lewat foto bukti, materi, catatan, dan statistik kehadiran." },
            { q: "Angka Hadir dan Tidak hadir, mana yang benar?", a: "Keduanya dihitung dari data yang sama sebelum filter status diterapkan, jadi selalu konsisten berdampingan. Tabel di bawahnya yang mengikuti filter." },
            { q: "Bisakah mengubah data yang salah?", a: "Tidak dari akun ini. Minta guru memperbaiki lewat Riwayat-nya, atau minta admin memperbaiki data master." },
            { q: "Hari ini kosong, apakah sistem rusak?", a: "Bukan. Artinya belum ada jurnal masuk hari ini. Cek kembali siang atau sore hari, atau geser ke tanggal lalu untuk memastikan data tampil." },
          ]} />
        </PSection>

        <div className="mt-4">
          <PNote>Butuh data di luar yang tampil di layar? Minta admin mengekspor rentang yang diinginkan lewat Export Center atau Backup.</PNote>
        </div>
      </AppShell>
    </Guard>
  );
}
