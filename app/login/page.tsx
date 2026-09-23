"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { BookOpenCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/src/lib/auth";
import { Input, Select } from "@/src/components/ui/input";
import { Button } from "@/src/components/ui/button";

const schema = z.object({
  email: z.string().min(3, "Isi email / nama pengguna"),
  role: z.enum(["admin", "guru", "kepsek"]),
});
type F = z.infer<typeof schema>;

const hint: Record<F["role"], string> = {
  admin: "admin@sekolah.id",
  guru: "rinamarlina@smknusantaracerdas.id",
  kepsek: "kepsek@sekolah.id",
};

const homeOf = (role: F["role"]) => (role === "admin" ? "/admin" : role === "guru" ? "/guru" : "/kepsek");

export default function LoginPage() {
  const { login, user, ready } = useAuth();
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<F>({
    resolver: zodResolver(schema),
    defaultValues: { email: "rinamarlina@smknusantaracerdas.id", role: "guru" },
  });
  const role = watch("role");
  const homed = useRef(false);
  // Sudah login (mis. tombol back / sesi pulih) → redirect SEKALI ke home role.
  // Alur role tak berubah; tanpa ini pengguna authed bisa nyangkut di form login.
  useEffect(() => {
    if (!ready || !user || homed.current) return;
    homed.current = true;
    r.replace(homeOf(user.role));
  }, [ready, user, r]);
  async function onSubmit(v: F) {
    if (busy) return;
    setBusy(true);
    try {
      // Firestore tanpa timeout sendiri — batasi 25 dtk agar tombol tak macet
      // selamanya. Bila login asli menyusul sukses, effect di atas tetap
      // mengantar ke home (tanpa submit ulang).
      const u = await Promise.race([
        login(v.email, v.role),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("Login terlalu lama — periksa koneksi lalu coba lagi.")), 25000)),
      ]);
      toast.success("Selamat datang kembali!");
      r.replace(homeOf(u.role));
    } catch (e: any) {
      toast.error(e.message || "Gagal masuk");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid min-h-screen place-items-center bg-ink px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(46,91,255,.45),transparent),radial-gradient(40%_40%_at_80%_100%,rgba(239,160,11,.25),transparent)]" />
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative w-full max-w-md rounded-3xl bg-white p-7 shadow-soft sm:p-8">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-500 text-white shadow-pop"><BookOpenCheck /></span>
          <div>
            <h1 className="font-display text-xl font-bold">Jurnal Sekolah</h1>
            <p className="text-xs text-slate-500">SMK Nusantara Cerdas · masuk untuk mulai</p>
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <Input label="Email" placeholder={hint[role]} {...register("email")} error={errors.email?.message} />
          <Select label="Masuk sebagai (demo)" {...register("role")}>
            <option value="guru">Guru</option>
            <option value="admin">Admin</option>
            <option value="kepsek">Kepala Sekolah</option>
          </Select>
          <Button className="w-full" disabled={busy}>
            {busy && <Loader2 size={16} className="animate-spin" />} Masuk
          </Button>
          <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
            Mode demo: pilih peran lalu tekan Masuk. Coba email <b>{hint[role]}</b>. Token Sanctum dipakai otomatis bila backend hidup di <code>NEXT_PUBLIC_API_URL</code>.
          </p>
        </form>
      </motion.div>
    </div>
  );
}
