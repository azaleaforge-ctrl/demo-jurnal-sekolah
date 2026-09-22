"use client";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Crud } from "@/src/components/crud";
import { Input, Select } from "@/src/components/ui/input";
import { useCollection, type Doc } from "@/src/lib/db";
import { materials as fbMaterials, subjects as fbSubjects } from "@/src/lib/mock";

type Materi = { id: string; subject_id: string; title: string };

export default function MateriPage() {
  const materi = useCollection<Materi>("materials", { fallback: fbMaterials as Materi[] });
  const mapel = useCollection<Doc>("subjects", { fallback: fbSubjects as Doc[] });
  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="ATP / Materi" hint="Guru bisa pilih materi ini atau isi manual">
        <Crud
          title="Materi" initial={[]} value={materi.rows} onChange={materi.setRows}
          loading={materi.loading} persist={materi.persist}
          head={["Mapel", "Judul materi", "Aksi"]}
          cols={[
            { key: "subject_id", label: "Mapel", render: (r: any) => mapel.rows.find((s) => s.id === r.subject_id)?.name || r.subject_id },
            { key: "title", label: "Judul" },
          ]}
          renderForm={(v, set) => (
            <>
              <Select label="Mapel" value={(v as any).subject_id || ""} onChange={(e) => set({ ...v, subject_id: e.target.value })}>
                <option value="">Pilih mapel</option>
                {mapel.rows.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Input label="Judul materi" value={(v as any).title || ""} onChange={(e) => set({ ...v, title: e.target.value })} />
            </>
          )}
        />
      </AppShell>
    </Guard>
  );
}
