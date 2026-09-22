"use client";
import { toast } from "sonner";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Crud } from "@/src/components/crud";
import { ImportExcel, type ImportResult } from "@/src/components/import-excel";
import { Input } from "@/src/components/ui/input";
import { useCollection, batchAdd, type Doc } from "@/src/lib/db";
import { teachers as fbTeachers, subjects as fbSubjects, school } from "@/src/lib/mock";
import { slugEmail } from "@/src/lib/utils";

type Guru = { id: string; name: string; email: string; role: string; subject_ids: string[]; password?: string };
type Draft = { name: string; email: string; subject_ids: string[] };

const randPw = () => Math.random().toString(36).slice(2, 12);

export default function GuruPage() {
  const guru = useCollection<Guru>("users", {
    wheres: [["role", "==", "guru"]],
    fallback: fbTeachers.map((t) => ({ ...t, role: "guru" })),
  });
  const mapel = useCollection<Doc>("subjects", { fallback: fbSubjects as Doc[] });

  function mapRow(r: Record<string, any>): ImportResult<Draft> {
    const name = String(r.nama || "");
    let email = String(r.email || "").toLowerCase();
    const mp = String(r.mapel || "");
    if (!name) return { ok: false, error: "nama kosong" };
    if (!email) email = slugEmail(name, school.name.replace(/^SMK\s+/i, ""));
    else if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: `${name}: email "${email}" tidak valid` };
    const subject_ids: string[] = [];
    if (mp) {
      for (const part of mp.split(";").map((s) => s.trim()).filter(Boolean)) {
        const s = mapel.rows.find(
          (x) => String(x.code).toLowerCase() === part.toLowerCase() || String(x.name).toLowerCase() === part.toLowerCase()
        );
        if (!s) return { ok: false, error: `${name}: mapel "${part}" tidak dikenal` };
        if (!subject_ids.includes(s.id)) subject_ids.push(s.id);
      }
    }
    return { ok: true, data: { name, email, subject_ids } };
  }

  async function confirmImport(valid: Draft[], file: File) {
    const seen = new Set(guru.rows.map((r) => r.email.toLowerCase()));
    const fresh: Draft[] = [];
    let skipped = 0;
    valid.forEach((v) => {
      const k = v.email.toLowerCase();
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
      guru.setRows((p) => [...items.map((f) => ({ ...f, id: `g${Date.now()}-${f.email}` })), ...p]);
      toast.success(`Mode demo: ${fresh.length} guru digabung${skipped ? ` (${skipped} duplikat dilewati)` : ""}.`);
    }
  }

  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Data Guru" hint="Master guru — impor massal atau tambah manual; akun login di menu Akun">
        <Crud
          title="Guru" initial={[]} value={guru.rows} onChange={guru.setRows}
          loading={guru.loading}
          persist={{ ...guru.persist, create: (item: any) => guru.persist.create({ ...item, role: "guru", password: item.password || randPw() }) }}
          head={["Nama", "Email", "Aksi"]}
          cols={[{ key: "name", label: "Nama" }, { key: "email", label: "Email" }]}
          toolbarExtra={
            <ImportExcel<Draft>
              templateUrl="/admin/users/import-template"
              templateName="template-guru.xlsx"
              templateHeaders={["nama", "email", "mapel"]}
              templateExample={[["Contoh Guru", "", "PWEB; MTK"]]}
              mapRow={mapRow}
              previewHead={["Nama", "Email", "Mapel"]}
              toPreviewRow={(t) => [t.name, t.email, t.subject_ids.map((id) => mapel.rows.find((s) => s.id === id)?.code).filter(Boolean).join("; ") || "—"]}
              onConfirm={confirmImport}
            />
          }
          renderForm={(v, set) => (
            <>
              <Input label="Nama lengkap" value={(v as any).name || ""} onChange={(e) => set({ ...v, name: e.target.value })} />
              <Input label="Email" value={(v as any).email || ""} onChange={(e) => set({ ...v, email: e.target.value })} />
            </>
          )}
        />
      </AppShell>
    </Guard>
  );
}
