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
import { cn, slugEmail } from "@/src/lib/utils";
import { getSetting, saveSetting, mockSetting, listDocs, updateDocById, type Doc } from "@/src/lib/db";
import { runSeed } from "@/src/lib/seed";

// Akun guru "otomatis": bertanda emailAuto ATAU emailnya persis pola generate
// slug(nama)@slug(nama sekolah saat itu). Akun email kustom tak pernah ikut.
function isAutoUser(u: Doc, school: string): boolean {
  return u.role === "guru" && ((u as any).emailAuto === true || u.email === slugEmail(u.name, school));
}

export default function PengaturanPage() {
  const fb = mockSetting();
  const [nama, setNama] = useState(fb.school_name);
  const [tahun, setTahun] = useState(fb.academic_year);
  const [kepsek, setKepsek] = useState(fb.principal_name || "Drs. Haryanto");
  const [smt, setSmt] = useState<"Ganjil" | "Genap">(fb.semester === "genap" ? "Genap" : "Ganjil");
  const [savedName, setSavedName] = useState(fb.school_name);
  const [autoUsers, setAutoUsers] = useState<Doc[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [prog, setProg] = useState({ done: 0, total: 9, label: "" });

  useEffect(() => {
    (async () => {
      try {
        const s = await getSetting();
        const base = s?.school_name || fb.school_name;
        if (s) {
          setNama(s.school_name);
          setTahun(s.academic_year);
          setSmt(s.semester === "genap" ? "Genap" : "Ganjil");
          setKepsek(s.principal_name || "Drs. Haryanto");
        }
        setSavedName(base);
        try {
          const users = await listDocs("users");
          setAutoUsers(users.filter((u) => isAutoUser(u, base)));
        } catch {
          setAutoUsers(null);
        }
      } catch {
        toast.info("Mode demo — memakai data lokal.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const next = nama.trim();
    if (!next) return toast.error("Nama sekolah wajib diisi.");
    setSaving(true);
    try {
      await saveSetting({ school_name: next, academic_year: tahun.trim(), semester: smt.toLowerCase(), principal_name: kepsek.trim() || "Drs. Haryanto" });
      // Ganti nama sekolah → email akun otomatis ikut pola slug baru.
      let renamed = 0;
      if (next !== savedName && autoUsers?.length) {
        for (const u of autoUsers) {
          try {
            const mail = slugEmail(u.name, next);
            if (mail !== u.email) {
              await updateDocById("users", u.id, { email: mail, emailAuto: true });
              renamed++;
            } else if (!(u as any).emailAuto) {
              await updateDocById("users", u.id, { emailAuto: true });
            }
          } catch { /* satu gagal, lanjut sisanya */ }
        }
        try {
          const users = await listDocs("users");
          setAutoUsers(users.filter((u) => isAutoUser(u, next)));
        } catch {}
        setSavedName(next);
      }
      toast.success(renamed ? `Pengaturan disimpan; ${renamed} email akun otomatis diperbarui.` : "Pengaturan sekolah disimpan.");
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
                <Input label="Nama Kepala Sekolah" placeholder="Drs. Haryanto" value={kepsek} onChange={(e) => setKepsek(e.target.value)} />
                {autoUsers !== null && (
                  <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
                    {autoUsers.length > 0 ? (
                      <><b>{autoUsers.length} akun otomatis akan ikut berubah</b> — email guru berpola slug(nama)@slug(sekolah) diperbarui saat nama sekolah diganti. Akun email kustom tidak ikut.</>
                    ) : (
                      <>Tidak ada akun email otomatis — email kustom tidak ikut berubah saat nama sekolah diganti.</>
                    )}
                  </p>
                )}
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
