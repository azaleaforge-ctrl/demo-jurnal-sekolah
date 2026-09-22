"use client";
import Link from "next/link";
import { PenLine, History, Clock } from "lucide-react";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card, Stat } from "@/src/components/ui/card";
import { journals } from "@/src/lib/mock";

export default function GuruHome() {
  return (
    <Guard roles={["guru"]}>
      <AppShell role="guru" title="Halo, Ibu/Bapak Guru 👋" hint="Isi jurnal hari ini — cukup 1 menit dari HP">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Jurnal bulan ini" value="12" hint="Naik 3 dari bulan lalu" />
          <Stat label="Jam mengajar" value="24 JP" hint="Pekan berjalan" />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link href="/guru/jurnal-baru" className="rounded-2xl bg-ink p-5 text-white shadow-soft transition hover:-translate-y-0.5">
            <PenLine size={22} className="text-accent-400" />
            <p className="font-display mt-2 font-bold">Isi Jurnal Baru</p>
            <p className="text-sm text-white/60">Wizard 4 langkah: kelas → materi → foto & TTD → absensi.</p>
          </Link>
          <Link href="/guru/riwayat" className="rounded-2xl bg-white p-5 shadow-soft transition hover:-translate-y-0.5">
            <History size={22} className="text-brand-500" />
            <p className="font-display mt-2 font-bold">Riwayat Jurnal</p>
            <p className="text-sm text-slate-500">Lihat foto, TTD & cetak PDF rekap pribadi.</p>
          </Link>
        </div>
        <Card className="mt-4">
          <h2 className="flex items-center gap-2 font-display font-bold"><Clock size={17} /> Terakhir diisi</h2>
          <div className="mt-2 space-y-2">
            {journals.map((j) => (
              <div key={j.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm">
                <div><p className="font-semibold">{j.subject} · {j.class}</p><p className="text-xs text-slate-500">{j.date} · {j.material}</p></div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">Tersimpan</span>
              </div>
            ))}
          </div>
        </Card>
      </AppShell>
    </Guard>
  );
}
