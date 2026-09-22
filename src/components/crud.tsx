"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Table } from "@/src/components/ui/table";
import { Modal, ConfirmModal } from "@/src/components/ui/modal";
import { Empty, Skeleton } from "@/src/components/ui/misc";

export type Col<T> = { key: string; label: string; render?: (row: T) => React.ReactNode };

export type Persist<T> = {
  create: (item: any) => Promise<string>;
  update: (id: string, item: any) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const stripId = (o: any) => { const { id, ...rest } = o || {}; return rest; };

export function Crud<T extends { id: string }>({
  title, head, cols, initial, renderForm, emptyHint, value, onChange, toolbarExtra, persist, loading,
}: {
  title: string; head: string[]; cols: Col<T>[]; initial: T[];
  renderForm: (v: any, set: (v: any) => void) => React.ReactNode;
  emptyHint?: string;
  value?: T[]; onChange?: (rows: T[]) => void; toolbarExtra?: React.ReactNode;
  persist?: Persist<T>; loading?: boolean;
}) {
  const [inner, setInner] = useState<T[]>(initial);
  const rows = value ?? inner;
  const setRows = (u: T[] | ((p: T[]) => T[])) => {
    const next = typeof u === "function" ? (u as (p: T[]) => T[])(rows) : u;
    if (onChange) onChange(next);
    else setInner(next);
  };
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<T | null>(null);
  const [edit, setEdit] = useState<Partial<T> | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(s));
  }, [rows, q]);

  async function save() {
    setSaving(true);
    try {
      if (edit?.id) {
        await persist?.update?.(edit.id, stripId(edit));
        setRows((p) => p.map((r) => (r.id === edit.id ? { ...r, ...edit } as T : r)));
        toast.success(`${title} diperbarui.`);
      } else {
        const id = (await persist?.create?.(stripId(edit))) || `x${Date.now()}`;
        setRows((p) => [{ ...edit, id } as T, ...p]);
        toast.success(`${title} ditambahkan.`);
      }
      setOpen(false); setEdit(null);
    } catch {
      toast.error(`Gagal menyimpan ${title.toLowerCase()}.`);
    } finally {
      setSaving(false);
    }
  }

  async function delYes() {
    try {
      if (del) await persist?.remove?.(del.id);
      setRows((p) => p.filter((r) => r.id !== del!.id));
      toast.success(`${title} dihapus.`);
    } catch {
      toast.error(`Gagal menghapus ${title.toLowerCase()}.`);
    } finally {
      setDel(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Cari ${title.toLowerCase()}…`} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
        </div>
        <div className="flex gap-2">
          {toolbarExtra}
          <Button onClick={() => { setEdit({}); setOpen(true); }}><Plus size={16} /> Tambah</Button>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-2/3" />
        </div>
      ) : filtered.length === 0 ? (
        <Empty title={`Belum ada ${title.toLowerCase()}`} hint={emptyHint || "Tambahkan data pertama lewat tombol Tambah."} />
      ) : (
        <Table head={head}>
          {filtered.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50/60">
              {cols.map((c) => <td key={c.key} className="px-4 py-3">{c.render ? c.render(r) : String((r as any)[c.key])}</td>)}
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <button onClick={() => { setEdit(r); setOpen(true); }} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-600" aria-label="Ubah"><Pencil size={15} /></button>
                  <button onClick={() => setDel(r)} className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Hapus"><Trash2 size={15} /></button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={edit?.id ? `Ubah ${title}` : `Tambah ${title}`}>
        <div className="space-y-3">{edit && renderForm(edit, setEdit)}</div>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" disabled={saving} onClick={() => setOpen(false)}>Batal</Button>
          <Button className="flex-1" disabled={saving} onClick={save}>{saving ? "Menyimpan…" : "Simpan"}</Button>
        </div>
      </Modal>
      <ConfirmModal open={!!del} onClose={() => setDel(null)} text={`Data ini akan dihapus permanen dan tidak bisa dikembalikan.`} onYes={delYes} />
    </div>
  );
}

export { Input };
