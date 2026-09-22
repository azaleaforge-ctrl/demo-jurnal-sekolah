"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Guard } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Table } from "@/src/components/ui/table";
import { Modal, ConfirmModal } from "@/src/components/ui/modal";
import { Badge, Empty, Skeleton } from "@/src/components/ui/misc";
import { useCollection } from "@/src/lib/db";
import { schedules as fbSchedules } from "@/src/lib/mock";

type Jam = { id: string; name: string; time?: string; kind?: string; order: number };
type Kind = "mulai" | "selesai";

const isTime = (t: string) => /^\d{2}\.\d{2}$/.test(t.trim());

function JamTable({ kind, title, rows, loading, onAdd, onEdit, onDel }: {
  kind: Kind; title: string; rows: Jam[]; loading: boolean;
  onAdd: () => void; onEdit: (r: Jam) => void; onDel: (r: Jam) => void;
}) {
  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display font-bold">{title}</h2>
        <Button className="min-w-0 max-sm:w-full max-sm:justify-center" onClick={onAdd}><Plus size={15} className="shrink-0" /> <span className="truncate">Jam {kind === "mulai" ? "Mulai" : "Selesai"}</span></Button>
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        ) : rows.length === 0 ? (
          <Empty title={`Belum ada jam ${kind}`} hint={`Tambah jam ${kind} pertama lewat tombol di atas.`} />
        ) : (
          <Table head={["Urutan", "Jam (HH.MM)", "Nama", "Aksi"]}>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">{r.order}</td>
                <td className="px-4 py-3 font-semibold">{r.time || <span className="text-slate-400">—</span>}</td>
                <td className="px-4 py-3 text-slate-500">{r.name}{!r.kind && <Badge tone="amber">lama</Badge>}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5">
                    <button onClick={() => onEdit(r)} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-600 sm:size-8" aria-label="Ubah"><Pencil size={15} /></button>
                    <button onClick={() => onDel(r)} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 sm:size-8" aria-label="Hapus"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Card>
  );
}

export default function JamPage() {
  const jam = useCollection<Jam>("schedules", { order: ["order", "asc"], fallback: fbSchedules as Jam[] });
  const [modal, setModal] = useState<{ kind: Kind; item?: Jam } | null>(null);
  const [time, setTime] = useState("");
  const [order, setOrder] = useState(1);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Jam | null>(null);

  const mulai = useMemo(() => jam.rows.filter((r) => (r.kind || "mulai") === "mulai").sort((a, b) => a.order - b.order), [jam.rows]);
  const selesai = useMemo(() => jam.rows.filter((r) => r.kind === "selesai").sort((a, b) => a.order - b.order), [jam.rows]);

  function openAdd(kind: Kind) {
    const max = Math.max(0, ...jam.rows.filter((r) => (r.kind || "mulai") === kind).map((r) => r.order || 0));
    setModal({ kind });
    setTime("");
    setOrder(max + 1);
  }
  function openEdit(r: Jam) {
    setModal({ kind: (r.kind as Kind) || "mulai", item: r });
    setTime(r.time || "");
    setOrder(r.order || 1);
  }

  async function save() {
    if (!modal) return;
    if (!isTime(time)) return toast.error("Isi jam format HH.MM, mis. 07.00.");
    if (!order || order < 1) return toast.error("Urutan minimal 1.");
    setBusy(true);
    try {
      const data = { time: time.trim(), order: Number(order), kind: modal.kind, name: modal.item?.name || `Jam ${Number(order)} ${modal.kind}` };
      if (modal.item) {
        await jam.persist.update(modal.item.id, data);
        jam.setRows((p) => p.map((r) => (r.id === modal.item!.id ? { ...r, ...data } : r)));
        toast.success("Jam diperbarui.");
      } else {
        const id = await jam.persist.create(data);
        jam.setRows((p) => [...p, { ...data, id }]);
        toast.success(`Jam ${modal.kind} ditambahkan.`);
      }
      setModal(null);
    } catch {
      toast.error("Gagal menyimpan jam.");
    } finally {
      setBusy(false);
    }
  }

  async function delYes() {
    try {
      if (del) await jam.persist.remove(del.id);
      jam.setRows((p) => p.filter((r) => r.id !== del!.id));
      toast.success("Jam dihapus.");
    } catch {
      toast.error("Gagal menghapus jam.");
    } finally {
      setDel(null);
    }
  }

  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Jam Mengajar" hint="Master jam = slot/shift mengajar guru: 2 daftar mulai & selesai, tampil berpasangan se-urutan">
        <div className="grid gap-4 lg:grid-cols-2">
          <JamTable kind="mulai" title="Jam Mulai" rows={mulai} loading={jam.loading} onAdd={() => openAdd("mulai")} onEdit={openEdit} onDel={setDel} />
          <JamTable kind="selesai" title="Jam Selesai" rows={selesai} loading={jam.loading} onAdd={() => openAdd("selesai")} onEdit={openEdit} onDel={setDel} />
        </div>
        <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.item ? `Ubah jam ${modal?.kind}` : `Tambah jam ${modal?.kind}`}>
          <div className="space-y-3">
            <Input label="Jam (HH.MM)" placeholder="07.00" value={time} onChange={(e) => setTime(e.target.value)} />
            <Input label="Urutan" type="number" value={order} onChange={(e) => setOrder(Number(e.target.value))} />
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" disabled={busy} onClick={() => setModal(null)}>Batal</Button>
            <Button className="flex-1" disabled={busy} onClick={save}>{busy ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </Modal>
        <ConfirmModal open={!!del} onClose={() => setDel(null)} text="Data jam ini akan dihapus permanen." onYes={delYes} />
      </AppShell>
    </Guard>
  );
}
