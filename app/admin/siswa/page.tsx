"use client";
import Link from "next/link";
import { toast } from "sonner";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Crud } from "@/src/components/crud";
import { ImportExcel, type ImportResult } from "@/src/components/import-excel";
import { Input, Select } from "@/src/components/ui/input";
import { useCollection, batchAdd, addDocTo, type Doc } from "@/src/lib/db";
import { students as fbStudents, classes as fbClasses } from "@/src/lib/mock";

type Siswa = { id: string; nisn: string; name: string; class_id: string };
type Draft = { nisn: string; name: string; class_name: string };

export default function SiswaPage() {
  const siswa = useCollection<Siswa>("students", { order: ["name", "asc"], fallback: fbStudents as Siswa[] });
  const kelas = useCollection<Doc>("classes", { order: ["name", "asc"], fallback: fbClasses as Doc[] });

  function mapRow(r: Record<string, any>): ImportResult<Draft> {
    const nisn = String(r.nisn || "").trim();
    const name = String(r.nama || "").trim();
    const kel = String(r.kelas || "").trim();
    if (!nisn) return { ok: false, error: "nisn kosong" };
    if (!name) return { ok: false, error: `nisn ${nisn}: nama kosong` };
    if (!kel) return { ok: false, error: `nisn ${nisn}: kelas kosong` };
    // Kelas tak dikenal TIDAK error di sini — dibuat otomatis saat konfirmasi.
    return { ok: true, data: { nisn, name, class_name: kel } };
  }

  async function confirmImport(valid: Draft[], file: File) {
    // 1) Tiap nama kelas hasil impor yang belum ada otomatis ditambahkan
    // (dedupe case-insensitive + trim, tanpa ganda).
    const want = [...new Set(valid.map((v) => v.class_name.trim()).filter(Boolean))];
    const idOf = new Map<string, string>();
    kelas.rows.forEach((c) => idOf.set(String(c.name).trim().toLowerCase(), c.id));
    const freshNames = want.filter((n) => !idOf.has(n.toLowerCase()));
    let addedClasses = 0;
    if (freshNames.length) {
      try {
        for (const n of freshNames) {
          const id = await addDocTo("classes", { name: n });
          idOf.set(n.toLowerCase(), id);
        }
        await kelas.refresh();
        addedClasses = freshNames.length;
      } catch {
        const now = Date.now();
        freshNames.forEach((n, i) => {
          const id = `k${now}-${i}`;
          idOf.set(n.toLowerCase(), id);
        });
        kelas.setRows((p) => [...freshNames.map((n, i) => ({ id: `k${now}-${i}`, name: n })), ...p]);
        addedClasses = freshNames.length;
      }
    }
    // 2) Siswa seperti biasa, kelas dipetakan dari nama (termasuk yang baru dibuat).
    const seen = new Set(siswa.rows.map((r) => r.nisn));
    const fresh: { nisn: string; name: string; class_id: string }[] = [];
    let skipped = 0;
    valid.forEach((v) => {
      if (seen.has(v.nisn)) { skipped++; return; }
      seen.add(v.nisn);
      fresh.push({ nisn: v.nisn, name: v.name, class_id: idOf.get(v.class_name.trim().toLowerCase()) || "" });
    });
    const extra = addedClasses ? `, ${addedClasses} kelas baru` : "";
    if (!fresh.length) {
      toast.success(`Impor selesai: 0 baru, ${skipped} duplikat dilewati${extra}.`);
      return;
    }
    try {
      // writeBatch ≤500 + laporan { imported, skipped, errors[] } (§5)
      const n = await batchAdd("students", fresh);
      await siswa.refresh();
      toast.success(`Impor selesai: ${n} baru${skipped ? `, ${skipped} duplikat dilewati` : ""}${extra}.`);
    } catch {
      siswa.setRows((p) => [...fresh.map((f) => ({ ...f, id: `s${Date.now()}-${f.nisn}` })), ...p]);
      toast.success(`Mode demo: ${fresh.length} siswa digabung${skipped ? ` (${skipped} duplikat dilewati)` : ""}${extra}.`);
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
              <span className="inline-flex min-h-[44px] items-center rounded-xl bg-slate-100 px-3.5 text-sm font-bold text-slate-600 sm:min-h-0" title="Total siswa terdaftar (realtime)">
                {siswa.loading ? "…" : `${siswa.rows.length} siswa`}
              </span>
              <ImportExcel<Draft>
              templateUrl="/admin/students/template"
              templateName="template-siswa.xlsx"
              templateHeaders={["nisn", "nama", "kelas"]}
              templateExample={[["010", "Contoh Siswa", "X RPL 1"]]}
              pick={["nisn", "nama", "kelas"]}
              mapRow={mapRow}
              previewHead={["NISN", "Nama", "Kelas"]}
              toPreviewRow={(t) => [t.nisn, t.name, t.class_name]}
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
              <p className="text-xs text-slate-500">Belum ada kelas? Kelola di menu <Link href="/admin/kelas" className="font-semibold text-brand-600 hover:underline">Kelas →</Link></p>
            </>
          )}
        />
      </AppShell>
    </Guard>
  );
}
