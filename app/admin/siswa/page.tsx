"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Crud } from "@/src/components/crud";
import { ImportExcel, type ImportResult } from "@/src/components/import-excel";
import { Input, Select } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";
import { Modal } from "@/src/components/ui/modal";
import { useCollection, batchAdd, type Doc } from "@/src/lib/db";
import { students as fbStudents, classes as fbClasses } from "@/src/lib/mock";

type Siswa = { id: string; nisn: string; name: string; class_id: string };
type Draft = { nisn: string; name: string; class_id: string };

export default function SiswaPage() {
  const siswa = useCollection<Siswa>("students", { order: ["name", "asc"], fallback: fbStudents as Siswa[] });
  const kelas = useCollection<Doc>("classes", { order: ["name", "asc"], fallback: fbClasses as Doc[] });
  const [kelasOpen, setKelasOpen] = useState(false);
  const [kelasNama, setKelasNama] = useState("");
  const [kelasWali, setKelasWali] = useState("");
  const [kelasBusy, setKelasBusy] = useState(false);

  function mapRow(r: Record<string, any>): ImportResult<Draft> {
    const nisn = String(r.nisn || "");
    const name = String(r.nama || "");
    const kel = String(r.kelas || "");
    if (!nisn) return { ok: false, error: "nisn kosong" };
    if (!name) return { ok: false, error: `nisn ${nisn}: nama kosong` };
    const c = kelas.rows.find((x) => String(x.name).toLowerCase() === kel.toLowerCase());
    if (!c) return { ok: false, error: `nisn ${nisn}: kelas "${kel}" tidak dikenal` };
    return { ok: true, data: { nisn, name, class_id: c.id } };
  }

  async function confirmImport(valid: Draft[], file: File) {
    const seen = new Set(siswa.rows.map((r) => r.nisn));
    const fresh: Draft[] = [];
    let skipped = 0;
    valid.forEach((v) => {
      if (seen.has(v.nisn)) skipped++;
      else { seen.add(v.nisn); fresh.push(v); }
    });
    if (!fresh.length) {
      toast.success(`Impor selesai: 0 baru, ${skipped} duplikat dilewati.`);
      return;
    }
    try {
      // writeBatch ≤500 + laporan { imported, skipped, errors[] } (§5)
      const n = await batchAdd("students", fresh);
      await siswa.refresh();
      toast.success(`Impor selesai: ${n} baru${skipped ? `, ${skipped} duplikat dilewati` : ""}.`);
    } catch {
      siswa.setRows((p) => [...fresh.map((f) => ({ ...f, id: `s${Date.now()}-${f.nisn}` })), ...p]);
      toast.success(`Mode demo: ${fresh.length} siswa digabung${skipped ? ` (${skipped} duplikat dilewati)` : ""}.`);
    }
  }

  async function quickKelas() {
    if (!kelasNama.trim()) return toast.error("Isi nama kelas dulu.");
    setKelasBusy(true);
    try {
      await kelas.persist.create({ name: kelasNama.trim(), wali: kelasWali.trim() || undefined });
      await kelas.refresh();
      setKelasNama("");
      setKelasWali("");
      setKelasOpen(false);
      toast.success("Kelas ditambahkan.");
    } catch {
      toast.error("Gagal menambah kelas.");
    } finally {
      setKelasBusy(false);
    }
  }

  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Data Siswa" hint="Cari, tambah, ubah, hapus — atau impor dari Excel/CSV">
        <Crud
          title="Siswa" initial={[]} value={siswa.rows} onChange={siswa.setRows}
          loading={siswa.loading} persist={siswa.persist}
          head={["NISN", "Nama", "Kelas", "Aksi"]}
          cols={[
            { key: "nisn", label: "NISN" },
            { key: "name", label: "Nama" },
            { key: "class_id", label: "Kelas", render: (r: any) => kelas.rows.find((c) => c.id === r.class_id)?.name || r.class_id },
          ]}
          toolbarExtra={
            <>
              <Button variant="outline" className="max-sm:flex-1" onClick={() => setKelasOpen(true)}><Plus size={15} /> Tambah Kelas</Button>
              <ImportExcel<Draft>
                templateUrl="/admin/students/template"
                templateName="template-siswa.xlsx"
                templateHeaders={["nisn", "nama", "kelas"]}
                templateExample={[["010", "Contoh Siswa", "X RPL 1"]]}
                mapRow={mapRow}
                previewHead={["NISN", "Nama", "Kelas"]}
                toPreviewRow={(t) => [t.nisn, t.name, kelas.rows.find((c) => c.id === t.class_id)?.name || t.class_id]}
                onConfirm={confirmImport}
              />
            </>
          }
          renderForm={(v, set) => (
            <>
              <Input label="NISN" value={(v as any).nisn || ""} onChange={(e) => set({ ...v, nisn: e.target.value })} />
              <Input label="Nama lengkap" value={(v as any).name || ""} onChange={(e) => set({ ...v, name: e.target.value })} />
              <Select label="Kelas" value={(v as any).class_id || ""} onChange={(e) => set({ ...v, class_id: e.target.value })}>
                <option value="">Pilih kelas</option>
                {kelas.rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </>
          )}
        />
        <Modal open={kelasOpen} onClose={() => setKelasOpen(false)} title="Tambah Kelas">
          <Input label="Nama kelas" placeholder='Mis. "X RPL 3"' value={kelasNama} onChange={(e) => setKelasNama(e.target.value)} />
          <div className="mt-3">
            <Input label="Wali kelas" placeholder="Nama wali kelas" value={kelasWali} onChange={(e) => setKelasWali(e.target.value)} />
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={kelasBusy} onClick={() => setKelasOpen(false)}>Batal</Button>
            <Button className="flex-1" disabled={kelasBusy} onClick={quickKelas}>{kelasBusy ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </Modal>
      </AppShell>
    </Guard>
  );
}
