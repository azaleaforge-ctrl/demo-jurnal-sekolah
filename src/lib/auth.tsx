"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "./mock";
import { users } from "./mock";
import { apiClient } from "./api";
import { findUserByEmail, listDocs } from "./db";

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
  // useCallback + useMemo: value konteks stabil — logout/login tak memicu
  // render ulang berantai ke semua konsumen useAuth (pemicu effect-loop Guard).
  const login = useCallback(async (email: string, role: Role): Promise<User> => {
    const mail = email.trim().toLowerCase();
    // 1) Backend Laravel bila hidup
    try {
      const res = await apiClient.post<{ user: User; token: string }>("/auth/login", { email: mail });
      localStorage.setItem("token", res.token);
      localStorage.setItem("user", JSON.stringify(res.user));
      setUser(res.user);
      return res.user;
    } catch {}
    // 2) Mode trial: email harus ada di koleksi users, role ikut data (§5).
    //    Toleran beda domain seed lama/baru: cocokkan local-part (sebelum @).
    try {
      const local = mail.split("@")[0];
      const d =
        (await findUserByEmail(mail)) ||
        (await listDocs("users")).find((x: any) => String(x.email || "").split("@")[0] === local);
      if (d) {
        const u: User = { id: d.id, name: d.name, email: d.email, role: d.role };
        localStorage.setItem("token", "trial-token");
        localStorage.setItem("user", JSON.stringify(u));
        setUser(u);
        return u;
      }
    } catch (e: any) {
      if (e.message !== "Firestore tak terjangkau") throw e;
    }
    // 3) Fallback mock bila Firestore tak terjangkau / email belum di-seed
    const u =
      users.find((x) => x.email === mail && x.role === role) ||
      users.find((x) => x.role === role);
    if (!u) throw new Error("Akun tidak ditemukan. Minta admin mendaftarkan email ini.");
    localStorage.setItem("token", "demo-token");
    localStorage.setItem("user", JSON.stringify(u));
    setUser(u);
    return u;
  }, []);
  const logout = useCallback(() => {
    try {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
    } finally {
      setUser(null);
    }
  }, []);
  const value = useMemo(() => ({ user, login, logout, ready }), [user, login, logout, ready]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

const homeOf = (role: Role) => (role === "admin" ? "/admin" : role === "guru" ? "/guru" : "/kepsek");

export function Guard({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const r = useRouter();
  // Deps stabil: roles inline-literal ["admin"] identitasnya baru tiap render —
  // pakai string key agar effect tak tembak r.replace() berulang (redirect loop
  // = navigasi tak pernah commit = "Memuat…" selamanya pasca-logout).
  const key = roles.join(",");
  const sent = useRef<string | null>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const target = !user ? "/login" : key.split(",").includes(user.role) ? null : homeOf(user.role);
    if (!target) return;
    // Redirect sekali per (user, target) — bukan tiap render.
    const id = `${user?.id ?? "-"}>${target}`;
    if (sent.current === id) return;
    sent.current = id;
    r.replace(target);
  }, [user, ready, r, key]);
  // Fallback: bila pengalihan tertahan >8 dtk, tawarkan muat ulang (tanpa refresh manual buta).
  useEffect(() => {
    if (ready && user) {
      setStuck(false);
      return;
    }
    setStuck(false);
    const t = setTimeout(() => setStuck(true), 8000);
    return () => clearTimeout(t);
  }, [ready, user]);
  if (!ready || !user) {
    return (
      <div className="p-10 text-center text-sm text-slate-500">
        Memuat…
        {stuck && (
          <div className="mx-auto mt-3 max-w-xs rounded-xl bg-white p-4 shadow-soft">
            <p className="mb-2 text-xs">Pengalihan tertahan. Muat ulang halaman ini saja:</p>
            <button onClick={() => window.location.reload()} className="rounded-xl bg-ink px-4 py-2 text-xs font-bold text-white">
              Muat ulang
            </button>
          </div>
        )}
      </div>
    );
  }
  if (!key.split(",").includes(user.role)) return null;
  return <>{children}</>;
}
