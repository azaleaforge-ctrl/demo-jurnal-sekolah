"use client";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Crud } from "@/src/components/crud";
import { Input } from "@/src/components/ui/input";
import { useCollection } from "@/src/lib/db";
import { subjects as fbSubjects } from "@/src/lib/mock";

type Mapel = { id: string; name: string; code: string };

export default function MapelPage() {
  const mapel = useCollection<Mapel>("subjects", { order: ["code", "asc"], fallback: fbSubjects as Mapel[] });
  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Mata Pelajaran" hint="Kode singkat dipakai di rekap & jadwal">
        <Crud
          title="Mapel" initial={[]} value={mapel.rows} onChange={mapel.setRows}
          loading={mapel.loading} persist={mapel.persist}
          head={["Kode", "Nama", "Aksi"]}
          cols={[{ key: "code", label: "Kode" }, { key: "name", label: "Nama" }]}
          renderForm={(v, set) => (
            <>
              <Input label="Kode" placeholder="PWEB" value={(v as any).code || ""} onChange={(e) => set({ ...v, code: e.target.value })} />
              <Input label="Nama mapel" value={(v as any).name || ""} onChange={(e) => set({ ...v, name: e.target.value })} />
            </>
          )}
        />
      </AppShell>
    </Guard>
  );
}
