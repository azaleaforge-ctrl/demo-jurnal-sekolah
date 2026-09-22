"use client";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Crud } from "@/src/components/crud";
import { Input } from "@/src/components/ui/input";
import { useCollection } from "@/src/lib/db";
import { classes as fbClasses } from "@/src/lib/mock";

type Kelas = { id: string; name: string; wali?: string };

export default function KelasPage() {
  const kelas = useCollection<Kelas>("classes", { order: ["name", "asc"], fallback: fbClasses as Kelas[] });
  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Data Kelas" hint="Satu-satunya penentu daftar absensi siswa">
        <Crud
          title="Kelas" initial={[]} value={kelas.rows} onChange={kelas.setRows}
          loading={kelas.loading} persist={kelas.persist}
          head={["Nama kelas", "Wali kelas", "Aksi"]}
          cols={[
            { key: "name", label: "Nama" },
            { key: "wali", label: "Wali", render: (r: any) => r.wali || "—" },
          ]}
          renderForm={(v, set) => (
            <>
              <Input label="Nama kelas" placeholder='Mis. "X RPL 1"' value={(v as any).name || ""} onChange={(e) => set({ ...v, name: e.target.value })} />
              <Input label="Wali kelas" placeholder="Nama wali kelas" value={(v as any).wali || ""} onChange={(e) => set({ ...v, wali: e.target.value })} />
            </>
          )}
        />
      </AppShell>
    </Guard>
  );
}
