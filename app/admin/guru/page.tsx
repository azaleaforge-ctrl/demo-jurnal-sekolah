"use client";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Crud } from "@/src/components/crud";
import { ImportExcel, type ImportResult } from "@/src/components/import-excel";
import { Input, Select } from "@/src/components/ui/input";
import { useCollection, batchAdd, updateDocById, type Doc } from "@/src/lib/db";
import { teachers as fbTeachers, subjects as fbSubjects, classes as fbClasses } from "@/src/lib/mock";
import { byName } from "@/src/lib/utils";

type Guru = { id: string; name: string; gelar?: string; email: string; role: string; subject_ids: string[]; class_ids?: string[]; password?: string };
type Draft = { name: string; gelar: string };

const randPw = () => Math.random().toString(36).slice(2, 12);
const namaGelar = (r: { name: string; gelar?: string }) => (r.gelar?.trim() ? `${r.name}, ${r.gelar.trim()}` : r.name);

export default function GuruPage() {
  const guru = useCollection<Guru>("users", {
    wheres: [["role", "==", "guru"]],
    fallback: fbTeachers.map((t) => ({ ...t, role: "guru" })) as Guru[],
  });

  // Backfill gelar sekali per sesi: doc guru Firestore tanpa gelar → default "S.Pd".
  const gelarFix = useRef(false);
  const users = guru.rows;
  useEffect(() => {
    if (gelarFix.current || !guru.remote || guru.loading) return;
    const missing = users.filter((u) => !String((u as any).gelar || "").trim());
    if (!missing.length) return;
    gelarFix.current = true;
    (async () => {
      for (const m of missing) {
        try { await updateDocById("users", m.id, { gelar: "S.Pd" }); } catch {}
      }
    })();
  }, [guru.remote, guru.loading, users]);

  const sorted = useMemo(() => [...users].sort(byName()), [users]);
  const mapel = useCollection<Doc>("subjects", { fallback: fbSubjects as Doc[] });
  const kelas = useCollection<Doc>("classes", { order: ["name", "asc"], fallback: fbClasses as Doc[] });
  const mapelName = (id?: string) => {
    const s = mapel.rows.find((x) => x.id === id);
    return s ? `${s.name} (${s.code})` : "–";
  };
  const kelasNames = (ids?: string[]) => (ids || [])
    .map((id) => kelas.rows.find((c) => c.id === id)?.name || id)
    .filter(Boolean)
    .join(", ") || "–";

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
          title="Guru" initial={[]} value={sorted} onChange={guru.setRows}
          loading={guru.loading}
          persist={{ ...guru.persist, create: (item: any) => guru.persist.create({ ...item, role: "guru", password: item.password || randPw() }) }}
          head={["Nama", "Gelar", "Mapel", "Kelas Mengajar", "Aksi"]}
          cols={[
            { key: "name", label: "Nama", render: (r: any) => <span className="block max-w-[42vw] truncate font-semibold sm:max-w-none" title={namaGelar(r)}>{namaGelar(r)}</span> },
            { key: "gelar", label: "Gelar", render: (r: any) => String(r.gelar || "").trim() || "–" },
            { key: "subject_ids", label: "Mapel", render: (r: any) => mapelName((r.subject_ids || [])[0]) },
            { key: "class_ids", label: "Kelas Mengajar", render: (r: any) => <span className="block max-w-[42vw] truncate sm:max-w-none" title={kelasNames(r.class_ids)}>{kelasNames(r.class_ids)}</span> },
          ]}
          toolbarExtra={
            <>
              <span className="inline-flex min-h-[44px] items-center rounded-xl bg-slate-100 px-3.5 text-sm font-bold text-slate-600 sm:min-h-0" title="Total guru terdaftar (realtime)">
                {guru.loading ? "…" : `${sorted.length} guru`}
              </span>
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
            </>
          }
          renderForm={(v, set) => (
            <>
              <Input label="Nama lengkap" value={(v as any).name || ""} onChange={(e) => set({ ...v, name: e.target.value })} />
              <Input label="Gelar" placeholder="mis. S.Pd" value={(v as any).gelar || ""} onChange={(e) => set({ ...v, gelar: e.target.value })} />
              <Select label="Mapel" value={(v as any).subject_ids?.[0] || ""} onChange={(e) => set({ ...v, subject_ids: e.target.value ? [e.target.value] : [] })}>
                <option value="">Pilih mapel</option>
                {[...mapel.rows].sort(byName()).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </Select>
              <div>
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Kelas Mengajar</span>
                <div className="grid gap-1.5">
                  {[...kelas.rows].sort(byName()).map((c) => {
                    const on = ((v as any).class_ids || []).includes(c.id);
                    return (
                      <label key={c.id} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 text-sm sm:min-h-0">
                        <input
                          type="checkbox" checked={on} className="size-5 shrink-0 accent-brand-600"
                          onChange={(e) => {
                            const cur = (v as any).class_ids || [];
                            set({ ...v, class_ids: e.target.checked ? [...cur, c.id] : cur.filter((x: string) => x !== c.id) });
                          }}
                        />
                        <span className="font-medium">{c.name}</span>
                      </label>
                    );
                  })}
                  {kelas.rows.length === 0 && <p className="text-xs text-slate-500">Belum ada kelas — tambah dulu di menu Kelas.</p>}
                </div>
              </div>
            </>
          )}
        />
      </AppShell>
    </Guard>
  );
}
