"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/src/components/ui/card";
import { Table } from "@/src/components/ui/table";
import { cn } from "@/src/lib/utils";

// Primitif panduan bersama: gaya Card/Table/Badge konsisten halaman admin.

export function PSection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4 min-w-0">
      <h2 className="font-display font-bold">{title}</h2>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

export function PSteps({ items }: { items: { title: string; desc: string }[] }) {
  return (
    <ol className="space-y-2">
      {items.map((s, i) => (
        <li key={s.title} className="flex min-w-0 gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-500 text-sm font-bold text-white">{i + 1}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{s.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{s.desc}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PAcc({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-2">
      {items.map((f, i) => {
        const on = open === i;
        return (
          <div key={f.q} className="overflow-hidden rounded-2xl border border-slate-100">
            <button
              onClick={() => setOpen(on ? null : i)}
              aria-expanded={on}
              className="flex w-full min-h-[48px] items-center gap-2 bg-white px-4 py-3 text-left text-sm font-bold hover:bg-slate-50/60"
            >
              <span className="min-w-0 flex-1">{f.q}</span>
              <ChevronDown size={16} className={cn("shrink-0 text-slate-400 transition", on && "rotate-180")} />
            </button>
            {on && <p className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-sm leading-relaxed text-slate-600">{f.a}</p>}
          </div>
        );
      })}
    </div>
  );
}

export function PNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-brand-50 px-4 py-3 text-sm leading-relaxed text-brand-700">{children}</p>;
}

// Cara kerja harian: sama untuk semua role, tanpa menyebut fitur role lain.
export function SistemHarian() {
  return (
    <PSection title="Cara kerja data harian" hint="Kenapa layar selalu mulai dari hari ini">
      <div className="space-y-2 text-sm leading-relaxed text-slate-600">
        <p>Layar kerja selalu membuka <b>satu tanggal</b> (default hari ini). Data diambil sempit untuk tanggal itu saja, sehingga tampil cepat dan ringan di HP.</p>
        <p>Hari ini kosong adalah hal wajar: artinya belum ada jurnal masuk. Geser tanggal dengan tombol sebelum/sesudah atau date-picker untuk melihat snapshot hari lalu.</p>
      </div>
    </PSection>
  );
}

// Cara kerja arsip terbaru: dua tabel dengan fungsi berbeda. Dipakai halaman admin dan kepsek saja.
export function SistemArsip() {
  return (
    <>
      <PSection title="Arsip Sementara vs Backup Data Bulanan" hint="Dua tabel arsip dengan fungsi berbeda">
        <div className="space-y-2 text-sm leading-relaxed text-slate-600">
          <p><b>Tabel Arsip Sementara</b> berisi salinan kerja. Tombol <b>Arsip Sementara</b> menyalin data bulan berjalan (atau bulan terpilih) ke tabel ini. Salinan boleh dihapus kapan saja; menghapusnya hanya menghapus salinannya, data jurnal asli tetap utuh.</p>
          <p><b>Tabel Backup Data Bulanan</b> berisi arsip resmi: bulan penuh yang sudah selesai dan sudah dijadikan backup, lengkap dengan <b>file permanen</b> (ZIP) yang bisa diunduh kapan saja.</p>
        </div>
        <div className="mt-3">
          <Table head={["Aspek", "Arsip Sementara", "Backup Data Bulanan"]}>
            <tr className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-semibold">Isi</td>
              <td className="px-4 py-3">Salinan data bulan berjalan atau bulan terpilih</td>
              <td className="px-4 py-3">Bulan penuh yang sudah selesai, plus file permanen (ZIP)</td>
            </tr>
            <tr className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-semibold">Hapus</td>
              <td className="px-4 py-3">Boleh dihapus; yang hilang hanya salinannya, jurnal asli utuh</td>
              <td className="px-4 py-3">Dihapus lewat Reset dengan konfirmasi; jurnal asli tetap utuh</td>
            </tr>
            <tr className="hover:bg-slate-50/60">
              <td className="px-4 py-3 font-semibold">Kegunaan</td>
              <td className="px-4 py-3">Salinan kerja cepat sebelum backup resmi dibuat</td>
              <td className="px-4 py-3">Arsip resmi yang disimpan lama dan diunduh instan</td>
            </tr>
          </Table>
        </div>
        <div className="mt-2">
          <PNote>Prinsipnya sederhana: arsip hanya menyalin dan menyimpan. Jurnal dan absensi asli tidak pernah dihapus oleh arsip.</PNote>
        </div>
      </PSection>

      <PSection title="Isi file ZIP bulanan" hint="Satu tombol unduh menghasilkan satu file utuh">
        <div className="space-y-2 text-sm leading-relaxed text-slate-600">
          <p>Nama file: <b>Backup-(Bulan Tahun).zip</b>, tersimpan di <b>backups/TAHUN-BULAN/</b>. Struktur di dalamnya:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>(Bulan Tahun)/Guru/(Nama Guru)/</b> berisi 00-Rekap-Bulanan-(Nama).xlsx dan .pdf, plus folder Harian/Excel dan Harian/PDF per tanggal berdata</li>
            <li><b>(Bulan Tahun)/Siswa/(Nama Kelas)/</b> berisi 00-Rekap-Bulanan-(Kelas).xlsx dan .pdf, plus folder Harian/Excel dan Harian/PDF per tanggal berdata</li>
            <li>File bulanan boleh menyertakan foto bukti; file harian tanpa foto (kolom tertulis &quot;Ada&quot;) agar ukuran ringan</li>
            <li>Saat membuat ZIP tampil popup progres: jumlah file, akumulasi ukuran, dan estimasi waktu; ukuran akhir tampil di notifikasi</li>
          </ul>
        </div>
      </PSection>
    </>
  );
}
