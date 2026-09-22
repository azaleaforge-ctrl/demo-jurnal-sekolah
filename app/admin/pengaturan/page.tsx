"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DatabaseZap } from "lucide-react";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/misc";
import { cn } from "@/src/lib/utils";
import { getSetting, saveSetting, mockSetting } from "@/src/lib/db";
import { runSeed } from "@/src/lib/seed";

export default function PengaturanPage() {
  const fb = mockSetting();
  const [nama, setNama] = useState(fb.school_name);
  const [tahun, setTahun] = useState(fb.academic_year);
  const [smt, setSmt] = useState<"Ganjil" | "Genap">(fb.semester === "genap" ? "Genap" : "Ganjil");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 9, label: "" });

  useEffect(() => {
    (async () => {
      try {
        const s = await getSetting();
        if (s) {
          setNama(s.school_name);
          setTahun(s.academic_year);
          setSmt(s.semester === "genap" ? "Genap" : "Ganjil");
        }
      } catch {
        toast.info("Mode demo — memakai data lokal.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    if (!nama.trim()) return toast.error("Nama sekolah wajib diisi.");
    setSaving(true);
    try {
      await saveSetting({ school_name: nama.trim(), academic_year: tahun.trim(), semester: smt.toLowerCase() });
      toast.success("Pengaturan sekolah disimpan.");
    } catch {
      toast.success("Mode demo — pengaturan disimpan lokal.");
    } finally {
      setSaving(false);
    }
  }

  async function seed() {
    if (seeding) return;
    setSeeding(true);
    setProg({ done: 0, total: 9, label: "Memulai…" });
    try {
      const r = await runSeed((done, total, label) => setProg({ done, total, label }));
      const n = Object.entries(r.added).map(([k, v]) => `${k}: ${v}`).join(", ");
      toast.success(n ? `Data demo terisi (${n}).` : "Koleksi sudah berisi — tidak ada yang ditambah.");
      if (r.skipped.length) toast.info(`Dilewati: ${r.skipped.join(", ")}.`);
    } catch {
      toast.error("Seed gagal — periksa koneksi Firestore.");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Pengaturan Sekolah" hint="Nama sekolah tampil di kop rekap & login">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="font-display font-bold">Identitas sekolah</h2>
            {loading ? (
              <div className="mt-4 space-y-3"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : (
              <div className="mt-4 space-y-3">
                <Input label="Nama sekolah" value={nama} onChange={(e) => setNama(e.target.value)} />
                <Input label="Tahun ajaran" value={tahun} onChange={(e) => setTahun(e.target.value)} />
                <Button disabled={saving} onClick={save}>{saving ? "Menyimpan…" : "Simpan pengaturan"}</Button>
              </div>
            )}
          </Card>
          <Card>
            <h2 className="font-display font-bold">Semester aktif</h2>
            <p className="mt-1 text-sm text-slate-500">Jurnal baru otomatis tercatat di semester ini.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
              {(["Ganjil", "Genap"] as const).map((s) => (
                <button key={s} onClick={() => { setSmt(s); }} disabled={loading}
                  className={cn("min-h-[44px] rounded-xl py-2.5 text-sm font-bold transition", smt === s ? "bg-ink text-white shadow-soft" : "text-slate-500 hover:text-ink")}>
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">Aktif: <b>Semester {smt}</b> · {tahun}</p>
          </Card>
        </div>
        <Card className="mt-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><DatabaseZap size={20} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display font-bold">Data Demo Firestore</h2>
              <p className="text-sm text-slate-500">6 kelas × 30 siswa, 14 guru + admin + kepsek, 10 mapel, materi, 8 slot jam. Idempotent — koleksi berisi dilewati.</p>
              {seeding && (
                <div className="mt-3">
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{prog.done}/{prog.total} · {prog.label}</p>
                </div>
              )}
              <Button className="mt-3" disabled={seeding} onClick={seed}>
                <DatabaseZap size={15} /> {seeding ? "Mengisi…" : "Isi Data Demo"}
              </Button>
            </div>
          </div>
        </Card>
      </AppShell>
    </Guard>
  );
}
