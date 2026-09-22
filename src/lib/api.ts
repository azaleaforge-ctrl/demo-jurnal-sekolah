const BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export const API_BASE = BASE;

function token() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

function authHeaders(isJson: boolean): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (isJson) h["Content-Type"] = "application/json";
  const t = token();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

// Kontrak path persis spesifikasi_backend_laravel_api.md §3
export const endpoints = {
  studentsImport: "/admin/students/import",
  studentsTemplate: "/admin/students/template",
  teachersImport: "/admin/users/import-teachers",
  teachersTemplate: "/admin/users/import-template",
  users: "/admin/users",
  userPassword: (id: string) => `/admin/users/${id}/password`,
  generateTeacher: "/admin/users/generate-teacher",
  dashboardStats: "/admin/dashboard-stats",
  journalsFeed: "/admin/journals-feed",
  rekapPdf: "/export/rekap-pdf",
  rekapExcel: "/export/rekap-excel",
  journals: "/teacher/journals",
  journalsHistory: "/teacher/journals/history",
} as const;

export async function api<T = any>(
  path: string,
  opts: RequestInit & { timeoutMs?: number } = {},
  fallback?: T
): Promise<T> {
  const { timeoutMs, ...rest } = opts;
  const isJson = !!rest.body && typeof rest.body === "string";
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...rest,
      headers: { ...authHeaders(isJson), ...((rest.headers as Record<string, string>) || {}) },
      signal: AbortSignal.timeout(timeoutMs ?? 8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  } catch {
    if (fallback !== undefined) return fallback;
    throw new Error("Backend tidak terjangkau, gunakan data demo.");
  }
}

// POST multipart (import .xlsx/.csv, jurnal + foto + surat sakit) — tanpa header JSON
export async function postForm<T = any>(path: string, form: FormData, fallback?: T): Promise<T> {
  return api<T>(path, { method: "POST", body: form }, fallback);
}

// Unduh template langsung dari backend; false bila backend mati (panggil fallback lokal)
export async function downloadRemote(path: string, filename: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { ...authHeaders(false), Accept: "*/*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

export const apiClient = {
  get: <T = any>(p: string, fb?: T) => api<T>(p, {}, fb),
  post: <T = any>(p: string, body: any, fb?: T) =>
    api<T>(p, { method: "POST", body: JSON.stringify(body) }, fb),
  put: <T = any>(p: string, body: any, fb?: T) =>
    api<T>(p, { method: "PUT", body: JSON.stringify(body) }, fb),
  del: <T = any>(p: string, fb?: T) => api<T>(p, { method: "DELETE" }, fb),
  postForm,
};

// POST /teacher/journals (multipart, kontrak §3C): gagal → lempar agar caller fallback.
// timeoutMs singkat (default 2,5 dtk) agar API mati langsung skip tanpa tunggu lama.
export async function postJournal(form: FormData, timeoutMs = 2500): Promise<void> {
  await api(endpoints.journals, { method: "POST", body: form, timeoutMs });
}

export type AdminStats = {
  guru: { hadir: number; izin: number; sakit: number; belum_isi: number };
  siswa: { hadir: number; sakit: number; izin: number; alpha: number };
  per_teacher: { teacher_id: string; name: string; submitted_today: boolean; teacher_status: "hadir" | "izin" | "sakit" | null }[];
  per_class: { class_id: string; name: string; hadir: number; sakit: number; izin: number; alpha: number }[];
};

export type FeedQuery = { bulan?: string; tanggal_dari?: string; sampai?: string; class_id?: string; teacher_id?: string };

function qs(q: Record<string, string | undefined>) {
  const s = Object.entries(q).filter(([, v]) => !!v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
  return s ? `?${s}` : "";
}

// GET /admin/dashboard-stats?bulan=YYYY-MM — lempar bila backend mati (caller fallback lokal)
export async function adminStats(params: { bulan: string }): Promise<AdminStats> {
  return api<AdminStats>(`${endpoints.dashboardStats}?bulan=${params.bulan}`);
}

// GET /admin/journals-feed?... — array jurnal + ringkasan; normalisasi ke array
export async function adminFeed(params: FeedQuery): Promise<any[]> {
  const res = await api<any>(`${endpoints.journalsFeed}${qs(params)}`);
  return Array.isArray(res) ? res : res.data ?? [];
}
