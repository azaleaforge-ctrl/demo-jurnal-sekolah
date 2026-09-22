"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "./mock";
import { users } from "./mock";
import { apiClient } from "./api";
import { findUserByEmail } from "./db";

type User = { id: string; name: string; email: string; role: Role };
type Ctx = {
  user: User | null;
  login: (email: string, role: Role) => Promise<User>;
  logout: () => void;
  ready: boolean;
};

const AuthCtx = createContext<Ctx>({ user: null, login: async () => { throw new Error("belum siap"); }, logout: () => {}, ready: false });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);
  async function login(email: string, role: Role): Promise<User> {
    const mail = email.trim().toLowerCase();
    // 1) Backend Laravel bila hidup
    try {
      const res = await apiClient.post<{ user: User; token: string }>("/auth/login", { email: mail });
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      setUser(res.user);
      return res.user;
    } catch {}
    // 2) Mode trial: email harus ada di koleksi users, role ikut data (§5)
    try {
      const d = await findUserByEmail(mail);
      if (!d) throw new Error("Akun tidak ditemukan. Minta admin mendaftarkan email ini.");
      const u: User = { id: d.id, name: d.name, email: d.email, role: d.role };
      localStorage.setItem("token", "trial-token");
      localStorage.setItem("user", JSON.stringify(u));
      setUser(u);
      return u;
    } catch (e: any) {
      if (e.message !== "Firestore tak terjangkau") throw e;
    }
    // 3) Fallback mock bila Firestore tak terjangkau
    const u =
      users.find((x) => x.email === mail && x.role === role) ||
      users.find((x) => x.role === role);
    if (!u) throw new Error("Akun tidak ditemukan");
    localStorage.setItem("token", "demo-token");
    localStorage.setItem("user", JSON.stringify(u));
    setUser(u);
    return u;
  }
  function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    setUser(null);
  }
  return <AuthCtx.Provider value={{ user, login, logout, ready }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function Guard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const r = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (!user) r.replace("/login");
    else if (!roles.includes(user.role)) r.replace(user.role === "admin" ? "/admin" : user.role === "guru" ? "/guru" : "/kepsek");
  }, [user, ready, r, roles]);
  if (!ready || !user) return <div className="p-10 text-center text-sm text-slate-500">Memuat…</div>;
  if (!roles.includes(user.role)) return null;
  return <>{children}</>;
}
