"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { Guard, useAuth } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Button } from "@/src/components/ui/button";
import { Input, Select } from "@/src/components/ui/input";
import { Table } from "@/src/components/ui/table";
import { Modal, ConfirmModal } from "@/src/components/ui/modal";
import { Badge, Empty, Skeleton } from "@/src/components/ui/misc";
import { users as fbUsers, school, type Role } from "@/src/lib/mock";
import { useCollection, addDocTo, updateDocById, removeDoc } from "@/src/lib/db";
import { slugEmail } from "@/src/lib/utils";

type Akun = { id: string; name: string; email: string; role: Role; password?: string; subject_ids?: string[] };
const roleTone = (r: Role) => (r === "admin" ? "red" : r === "kepsek" ? "amber" : "blue");
const randPw = () => Math.random().toString(36).slice(2, 12);

export default function AkunPage() {
  const { user } = useAuth();
  const akun = useCollection<Akun>("users", { order: ["name", "asc"], fallback: fbUsers as Akun[] });
  const rows = akun.rows;
  const [q, setQ] = useState("");
  const [nama, setNama] = useState("");
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "guru" as Role, password: "" });
  const [edit, setEdit] = useState<Akun | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "guru" as Role });
  const [pw, setPw] = useState<Akun | null>(null);
  const [newPw, setNewPw] = useState("");
  const [del, setDel] = useState<Akun | null>(null);

  const filtered = useMemo(
    () => rows.filter((r) => `${r.name} ${r.email} ${r.role}`.toLowerCase().includes(q.toLowerCase())),
    [rows, q]
  );

  async function generate() {
    if (!nama.trim()) return toast.error("Isi nama guru dulu.");
    const email = slugEmail(nama, school.name.replace(/^SMK\s+/i, ""));
    if (rows.some((r) => r.email.toLowerCase() === email.toLowerCase())) return toast.error("Akun dengan email itu sudah ada.");
    const data = { name: nama.trim(), email, role: "guru" as Role, password: randPw() };
    try {
      const id = await addDocTo("users", data);
      akun.setRows((p) => [{ ...data, id }, ...p]);
      toast.success(`Akun dibuat: ${email}`);
    } catch {
      akun.setRows((p) => [{ ...data, id: `g${Date.now()}` }, ...p]);
      toast.success(`Mode demo — akun dibuat: ${email}`);
    }
    setNama("");
  }

  async function saveCreate() {
    if (!form.name.trim()) return toast.error("Nama wajib diisi.");
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return toast.error("Email tidak valid.");
    if (form.password.length < 8) return toast.error("Password minimal 8 karakter.");
    if (rows.some((r) => r.email.toLowerCase() === form.email.toLowerCase())) return toast.error("Email sudah dipakai.");
    const data = { name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role, password: form.password };
    try {
      const id = await addDocTo("users", data);
      akun.setRows((p) => [{ ...data, id }, ...p]);
      toast.success(`Akun ${data.role} dibuat.`);
    } catch {
      akun.setRows((p) => [{ ...data, id: `u${Date.now()}` }, ...p]);
      toast.success(`Mode demo — akun ${data.role} dibuat.`);
    }
    setCreate(false);
    setForm({ name: "", email: "", role: "guru", password: "" });
  }

  async function saveEdit() {
    if (!edit) return;
    if (!editForm.name.trim()) return toast.error("Nama wajib diisi.");
    if (!/^\S+@\S+\.\S+$/.test(editForm.email)) return toast.error("Email tidak valid.");
    const data = { name: editForm.name.trim(), email: editForm.email.trim().toLowerCase(), role: editForm.role };
    try {
      await updateDocById("users", edit.id, data);
    } catch {}
    akun.setRows((p) => p.map((r) => (r.id === edit.id ? { ...r, ...data } : r)));
    setEdit(null);
    toast.success("Akun diperbarui.");
  }

  async function savePw() {
    if (!pw) return;
    if (newPw.length < 8) return toast.error("Password minimal 8 karakter.");
    try {
      await updateDocById("users", pw.id, { password: newPw });
    } catch {}
    setPw(null);
    setNewPw("");
    toast.success("Password diperbarui.");
  }

  async function confirmDel() {
    if (!del) return;
    if (user && del.email.toLowerCase() === user.email.toLowerCase()) {
      toast.error("Tidak bisa menghapus akun sendiri.");
      return;
    }
    try {
      await removeDoc("users", del.id);
    } catch {}
    akun.setRows((p) => p.filter((r) => r.id !== del.id));
    setDel(null);
    toast.success("Akun dihapus.");
  }

  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Kelola Akun" hint="Admin, guru, dan kepala sekolah — email unik, password min. 8 karakter">
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft sm:flex-row">
          <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama guru, mis. Dewi Lestari" className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
          <Button onClick={generate}><Plus size={16} /> Generate guru</Button>
          <Button variant="outline" onClick={() => { setForm({ name: "", email: "", role: "guru", password: "" }); setCreate(true); }}><UserPlus size={16} /> Buat akun</Button>
        </div>
        <div className="relative mt-4">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, email, atau peran…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-500" />
        </div>
        <div className="mt-3">
          {akun.loading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-2/3" /></div>
          ) : filtered.length === 0 ? <Empty title="Akun tidak ditemukan" hint="Buat akun baru lewat tombol di atas." /> : (
            <Table head={["Nama", "Email", "Peran", "Aksi"]}>
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.email}</td>
                  <td className="px-4 py-3"><Badge tone={roleTone(r.role) as any}>{r.role}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button onClick={() => { setEdit(r); setEditForm({ name: r.name, email: r.email, role: r.role }); }} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-600 sm:size-8" aria-label="Ubah akun"><Pencil size={15} /></button>
                      <button onClick={() => { setPw(r); setNewPw(""); }} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-600 sm:size-8" aria-label="Ubah password"><KeyRound size={15} /></button>
                      <button onClick={() => setDel(r)} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 sm:size-8" aria-label="Hapus"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        <Modal open={create} onClose={() => setCreate(false)} title="Buat akun baru">
          <div className="space-y-3">
            <Input label="Nama lengkap" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Email" placeholder="nama@sekolah.id" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Select label="Peran" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="guru">Guru</option>
              <option value="kepsek">Kepala Sekolah</option>
              <option value="admin">Admin</option>
            </Select>
            <Input label="Password awal" type="password" placeholder="Minimal 8 karakter" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setCreate(false)}>Batal</Button>
            <Button className="flex-1" onClick={saveCreate}>Buat akun</Button>
          </div>
        </Modal>

        <Modal open={!!edit} onClose={() => setEdit(null)} title={`Ubah akun — ${edit?.name}`}>
          <div className="space-y-3">
            <Input label="Nama lengkap" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <Input label="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            <Select label="Peran" value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}>
              <option value="guru">Guru</option>
              <option value="kepsek">Kepala Sekolah</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setEdit(null)}>Batal</Button>
            <Button className="flex-1" onClick={saveEdit}>Simpan</Button>
          </div>
        </Modal>

        <Modal open={!!pw} onClose={() => setPw(null)} title={`Ubah password — ${pw?.name}`}>
          <Input label="Password baru" type="password" placeholder="Minimal 8 karakter" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setPw(null)}>Batal</Button>
            <Button className="flex-1" onClick={savePw}><Pencil size={15} /> Simpan</Button>
          </div>
        </Modal>
        <ConfirmModal open={!!del} onClose={() => setDel(null)} text={`${del?.name} (${del?.email}, ${del?.role}) tidak bisa lagi masuk setelah dihapus.`} onYes={confirmDel} />
      </AppShell>
    </Guard>
  );
}
