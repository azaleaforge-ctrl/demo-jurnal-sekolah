"use client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Pencil, Search, Trash2, UserPlus } from "lucide-react";
import { Guard, useAuth } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Table } from "@/src/components/ui/table";
import { Modal, ConfirmModal } from "@/src/components/ui/modal";
import { Badge, Empty, Skeleton } from "@/src/components/ui/misc";
import { users as fbUsers, type Role } from "@/src/lib/mock";
import { useCollection, updateDocById, removeDoc, getSetting, mockSetting } from "@/src/lib/db";
import { slugEmail, cn } from "@/src/lib/utils";

type Akun = { id: string; name: string; gelar?: string; email: string; role: Role; password?: string; emailAuto?: boolean; subject_ids?: string[] };
const namaGelar = (r: { name: string; gelar?: string }) => (String(r.gelar || "").trim() ? `${r.name}, ${String(r.gelar).trim()}` : r.name);
const randPw = () => Math.random().toString(36).slice(2, 12);

export default function AkunPage() {
  const { user } = useAuth();
  const akun = useCollection<Akun>("users", { order: ["name", "asc"], fallback: fbUsers as Akun[] });
  const rows = akun.rows;
  const [tab, setTab] = useState<"belum" | "sudah">("belum");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sch, setSch] = useState(mockSetting());
  const [manual, setManual] = useState<Akun | null>(null);
  const [manualForm, setManualForm] = useState({ email: "", password: "" });
  const [hasil, setHasil] = useState<{ name: string; email: string; password: string }[]>([]);
  const [edit, setEdit] = useState<Akun | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", role: "guru" as Role });
  const [pw, setPw] = useState<Akun | null>(null);
  const [newPw, setNewPw] = useState("");
  const [del, setDel] = useState<Akun | null>(null);

  useEffect(() => {
    getSetting()
      .then((s) => { if (s) setSch({ school_name: s.school_name, academic_year: s.academic_year, semester: s.semester, principal_name: s.principal_name }); })
      .catch(() => {});
  }, []);

  const schoolSlug = sch.school_name.replace(/^SMK\s+/i, "");
  const gurus = useMemo(() => rows.filter((r) => r.role === "guru"), [rows]);
  const belum = useMemo(() => gurus.filter((g) => !String(g.email || "").trim()), [gurus]);
  const sudah = useMemo(() => gurus.filter((g) => String(g.email || "").trim()), [gurus]);
  const others = useMemo(() => rows.filter((r) => r.role !== "guru"), [rows]);
  const list = tab === "belum" ? belum : sudah;
  const filtered = useMemo(
    () => list.filter((r) => `${r.name} ${r.gelar || ""} ${r.email}`.toLowerCase().includes(q.toLowerCase())),
    [list, q]
  );

  function toggle(id: string) {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function freeEmail(base: string) {
    const taken = new Set(rows.map((r) => String(r.email || "").toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    let n = 2;
    while (taken.has(`${base}${n}`.toLowerCase())) n++;
    return `${base}${n}`;
  }

  // Generate massal: email = slug(nama) + @ + slug(sekolah settings), password acak.
  // Tandai emailAuto agar ikut rename bila nama sekolah berubah.
  async function generateMassal() {
    const targets = belum.filter((g) => selected.includes(g.id));
    if (!targets.length) return toast.error("Pilih dulu guru yang belum punya akun.");
    const made: { name: string; email: string; password: string }[] = [];
    for (const g of targets) {
      const at = freeEmail(slugEmail(g.name, schoolSlug));
      const password = randPw();
      const data = { email: at, password, emailAuto: true };
      try {
        await updateDocById("users", g.id, data);
      } catch {}
      akun.setRows((p) => p.map((r) => (r.id === g.id ? { ...r, ...data } : r)));
      made.push({ name: namaGelar(g), email: at, password });
    }
    setSelected([]);
    setHasil(made);
    toast.success(`${made.length} akun dibuat.`);
  }

  function openManual() {
    const one = belum.find((g) => selected.includes(g.id));
    if (!one || selected.length !== 1) return;
    setManual(one);
    setManualForm({ email: "", password: "" });
  }

  async function saveManual() {
    if (!manual) return;
    if (!/^\S+@\S+\.\S+$/.test(manualForm.email)) return toast.error("Email tidak valid.");
    if (manualForm.password.length < 8) return toast.error("Password minimal 8 karakter.");
    if (rows.some((r) => r.id !== manual.id && String(r.email || "").toLowerCase() === manualForm.email.toLowerCase())) {
      return toast.error("Email sudah dipakai.");
    }
    const data = { email: manualForm.email.trim().toLowerCase(), password: manualForm.password };
    try {
      await updateDocById("users", manual.id, data);
    } catch {}
    akun.setRows((p) => p.map((r) => (r.id === manual.id ? { ...r, ...data, emailAuto: false } : r)));
    setHasil([{ name: namaGelar(manual), email: data.email, password: data.password }]);
    setManual(null);
    setSelected([]);
    toast.success(`Akun ${namaGelar(manual)} dibuat.`);
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

  function actions(r: Akun) {
    return (
      <div className="flex gap-1.5">
        <button onClick={() => { setEdit(r); setEditForm({ name: r.name, email: r.email, role: r.role }); }} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-600 sm:size-8" aria-label="Ubah akun"><Pencil size={15} /></button>
        <button onClick={() => { setPw(r); setNewPw(""); }} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-brand-50 hover:text-brand-600 sm:size-8" aria-label="Ubah password"><KeyRound size={15} /></button>
        <button onClick={() => setDel(r)} className="grid size-10 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 sm:size-8" aria-label="Hapus"><Trash2 size={15} /></button>
      </div>
    );
  }

  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Kelola Akun" hint="Pilih guru lalu generate — email dari nama guru + nama sekolah">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {(["belum", "sudah"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setSelected([]); }} className={cn("min-h-[44px] flex-1 rounded-lg px-3 py-1.5 sm:min-h-0", tab === t ? "bg-white shadow-soft" : "text-slate-500")}>
              {t === "belum" ? `Belum punya akun (${belum.length})` : `Sudah punya akun (${sudah.length})`}
            </button>
          ))}
        </div>

        {tab === "belum" && (
          <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white p-4 shadow-soft sm:flex-row">
            <Button className="flex-1" disabled={!selected.length} onClick={generateMassal}>
              <UserPlus size={16} /> Generate Akun ({selected.length})
            </Button>
            <Button variant="outline" className="flex-1" disabled={selected.length !== 1} onClick={openManual} title={selected.length !== 1 ? "Pilih tepat 1 guru" : `Buat manual untuk ${namaGelar(belum.find((g) => selected.includes(g.id)) || { name: "" })}`}>
              <Pencil size={15} /> Buat Manual
            </Button>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">
          {tab === "belum"
            ? `Centang guru, lalu Generate Akun massal. Email = nama guru + @${schoolSlug.toLowerCase().replace(/[^a-z0-9]+/g, "") || "sekolah"}.id, password acak.`
            : "Kelola akun yang sudah jadi: ubah data, reset password, atau hapus."}
        </p>

        <div className="relative mt-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau email…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-brand-500" />
        </div>

        <div className="mt-3">
          {akun.loading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-2/3" /></div>
          ) : filtered.length === 0 ? (
            <Empty title={tab === "belum" ? "Semua guru sudah punya akun" : "Belum ada akun guru"} hint={tab === "belum" ? "Tidak ada guru yang menunggu akun." : "Generate dari tab Belum punya akun."} />
          ) : tab === "belum" ? (
            <Table head={["", "Nama", "Gelar"]}>
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Pilih ${r.name}`} className="size-5 accent-brand-600" />
                  </td>
                  <td className="px-4 py-3 font-semibold">{r.name}</td>
                  <td className="px-4 py-3 text-slate-600">{String(r.gelar || "").trim() || "–"}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={["Nama", "Email", "Aksi"]}>
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-semibold">{namaGelar(r)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.email} {r.emailAuto && <Badge tone="blue">otomatis</Badge>}
                  </td>
                  <td className="px-4 py-3">{actions(r)}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        {others.length > 0 && (
          <div className="mt-6">
            <h2 className="font-display text-sm font-bold text-slate-500">Akun lain (admin / kepala sekolah)</h2>
            <div className="mt-2">
              <Table head={["Nama", "Email", "Peran", "Aksi"]}>
                {others.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-semibold">{r.name}</td>
                    <td className="px-4 py-3 text-slate-600">{r.email}</td>
                    <td className="px-4 py-3"><Badge tone={r.role === "admin" ? "red" : "amber"}>{r.role}</Badge></td>
                    <td className="px-4 py-3">{actions(r)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          </div>
        )}

        <Modal open={!!manual} onClose={() => setManual(null)} title={`Buat Manual — ${manual ? namaGelar(manual) : ""}`}>
          <div className="space-y-3">
            <Input label="Email" placeholder="nama@sekolah.id" value={manualForm.email} onChange={(e) => setManualForm({ ...manualForm, email: e.target.value })} />
            <Input label="Password" type="password" placeholder="Minimal 8 karakter" value={manualForm.password} onChange={(e) => setManualForm({ ...manualForm, password: e.target.value })} />
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setManual(null)}>Batal</Button>
            <Button className="flex-1" onClick={saveManual}>Buat akun</Button>
          </div>
        </Modal>

        <Modal open={hasil.length > 0} onClose={() => setHasil([])} title="Akun dibuat — salin kredensialnya">
          <Table head={["Nama", "Email", "Password"]}>
            {hasil.map((h) => (
              <tr key={h.email} className="hover:bg-slate-50/60">
                <td className="px-4 py-3 font-semibold">{h.name}</td>
                <td className="px-4 py-3">{h.email}</td>
                <td className="px-4 py-3 font-mono">{h.password}</td>
              </tr>
            ))}
          </Table>
          <div className="mt-5 flex gap-2">
            <Button className="flex-1" onClick={() => setHasil([])}>Selesai</Button>
          </div>
        </Modal>

        <Modal open={!!edit} onClose={() => setEdit(null)} title={`Ubah akun — ${edit?.name}`}>
          <div className="space-y-3">
            <Input label="Nama lengkap" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            <Input label="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
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
