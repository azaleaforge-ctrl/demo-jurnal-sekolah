"use client";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Crud } from "@/src/components/crud";
import { Input } from "@/src/components/ui/input";
import { useCollection } from "@/src/lib/db";
import { schedules as fbSchedules } from "@/src/lib/mock";

type Jam = { id: string; name: string; order: number };

export default function JamPage() {
  const jam = useCollection<Jam>("schedules", { order: ["order", "asc"], fallback: fbSchedules as Jam[] });
  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Jam Mengajar" hint="Master jam = slot/shift mengajar guru. Bisa ditambah dinamis sesuai jadwal sekolah">
        <Crud
          title="Jam" initial={[]} value={jam.rows} onChange={jam.setRows}
          loading={jam.loading} persist={jam.persist}
          head={["Urutan", "Nama jam", "Aksi"]}
          emptyHint="Master jam adalah slot mengajar guru — absensi siswa selalu seluruh kelas, tanpa konsep jam masuk."
          cols={[{ key: "order", label: "Urutan" }, { key: "name", label: "Nama" }]}
          renderForm={(v, set) => (
            <>
              <Input label="Nama jam" placeholder="Jam 5 (10.15 – 11.00)" value={(v as any).name || ""} onChange={(e) => set({ ...v, name: e.target.value })} />
              <Input label="Urutan" type="number" value={(v as any).order || 1} onChange={(e) => set({ ...v, order: Number(e.target.value) })} />
            </>
          )}
        />
      </AppShell>
    </Guard>
  );
}
