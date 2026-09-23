"use client";
import { toast } from "sonner";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Crud } from "@/src/components/crud";
import { ImportExcel, type ImportResult } from "@/src/components/import-excel";
import { Input } from "@/src/components/ui/input";
import { useCollection, batchAdd } from "@/src/lib/db";
import { teachers as fbTeachers } from "@/src/lib/mock";

type Guru = { id: string; name: string; gelar?: string; email: string; role: string; subject_ids: string[]; password?: string };
type Draft = { name: string; gelar: string };

const randPw = () => Math.random().toString(36).slice(2, 12);
const namaGelar = (r: { name: string; gelar?: string }) => (r.gelar?.trim() ? `${r.name}, ${r.gelar.trim()}` : r.name);

export default function GuruPage() {
  const guru = useCollection<Guru>("users", {
    wheres: [["role", "==", "guru"]],
    fallback: fbTeachers.map((t) => ({ ...t, role: "guru" })) as Guru[],
  });

  // Impor ketat: hanya NAMA + GELAR yang dibaca (email dibuat di menu Akun, bukan impor).
  // Baris tanpa nama dilewati dan terhitung di laporan "dilewati".
  function mapRow(r: Record<string, any>): ImportResult<Draft> {
    const name = String(r.nama || "").trim();
    const gelar = String(r.gelar || "").trim();
    if (!name) return { ok: false, error: "nama kosong" };
    return { ok: true, data: { name, gelar } };
  }

  async function confirmImport(valid: Draft[], file: File) {
    const seen = new Set(guru.rows.map((r) => r.name.trim().toLowerCase()));
    const fresh: Draft[] = [];
    let skipped = 0;
    valid.forEach((v) => {
      const k = v.name.trim().toLowerCase();
      if (seen.has(k)) skipped++;
      else { seen.add(k); fresh.push(v); }
    });
    if (!fresh.length) {
      toast.success(`Impor selesai: 0 baru, ${skipped} duplikat dilewati.`);
      return;
    }
    const items = fresh.map((f) => ({ ...f, role: "guru", password: randPw() }));
    try {
      const n = await batchAdd("users", items);
      await guru.refresh();
      toast.success(`Impor selesai: ${n} baru${skipped ? `, ${skipped} duplikat dilewati` : ""}.`);
    } catch {
      guru.setRows((p) => [...items.map((f, i) => ({ ...f, id: `g${Date.now()}-${i}`, email: "", subject_ids: [] as string[] })), ...p]);
      toast.success(`Mode demo: ${fresh.length} guru digabung${skipped ? ` (${skipped} duplikat dilewati)` : ""}.`);
    }
  }

  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Data Guru" hint="Master guru — impor massal atau tambah manual; email login dibuat di menu Akun">
        <Crud
          title="Guru" initial={[]} value={guru.rows} onChange={guru.setRows}
          loading={guru.loading}
          persist={{ ...guru.persist, create: (item: any) => guru.persist.create({ ...item, role: "guru", password: item.password || randPw() }) }}
          head={["Nama", "Gelar", "Aksi"]}
          cols={[
            { key: "name", label: "Nama", render: (r: any) => namaGelar(r) },
            { key: "gelar", label: "Gelar", render: (r: any) => String(r.gelar || "").trim() || "–" },
          ]}
          toolbarExtra={
            <ImportExcel<Draft>
              templateUrl="/admin/users/import-template"
              templateName="template-guru.xlsx"
              templateHeaders={["nama", "gelar"]}
              templateExample={[["Contoh Guru", "S.Pd"]]}
              pick={["nama", "gelar"]}
              mapRow={mapRow}
              previewHead={["Nama", "Gelar"]}
              toPreviewRow={(t) => [t.name, t.gelar || "–"]}
              onConfirm={confirmImport}
            />
          }
          renderForm={(v, set) => (
            <>
              <Input label="Nama lengkap" value={(v as any).name || ""} onChange={(e) => set({ ...v, name: e.target.value })} />
              <Input label="Gelar" placeholder="mis. S.Pd" value={(v as any).gelar || ""} onChange={(e) => set({ ...v, gelar: e.target.value })} />
            </>
          )}
        />
      </AppShell>
    </Guard>
  );
}
