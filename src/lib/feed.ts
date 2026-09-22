import { journals, teachers as mockTeachers, classes as mockClasses, subjects as mockSubjects } from "./mock";
import { listDocs, type Doc } from "./db";
import { rangeLabel } from "./slots";

// Satu sumber data demo: arsip wizard (localStorage) + mock, terurut terbaru.
// Bila backend hidup, api.adminFeed() dipetakan ke bentuk yang sama via normalizeRemote().

export type TeacherStatus = "hadir" | "izin" | "sakit";

export type FeedEntry = {
  id: string;
  teacher_id?: string;
  teacher: string;
  class_id?: string;
  class: string;
  subject_id?: string;
  subject: string;
  material: string;
  date: string; // YYYY-MM-DD
  notes: string;
  photo: string;
  signature: string;
  teacher_status: TeacherStatus;
  leave_note?: string;
  sick_letter_name?: string;
  sick_letter_note?: string;
  schedule?: string;
  schedule_id?: string;
  schedule_end_id?: string;
  // Label jadi (denormalisasi §2) — diutamakan agar sama di semua device.
  teacher_name?: string; class_name?: string; subject_name?: string;
  schedule_label?: string; material_text?: string;
  // Sumber baris: firestore | laravel | local | mock — anti join silang dunia.
  src?: string;
  attendances?: { student_id: string; status: string }[];
  stats: { hadir: number; sakit: number; izin: number; alpha: number };
};

const emptyStats = () => ({ hadir: 0, sakit: 0, izin: 0, alpha: 0 });

// Prioritas label: embed > nama lama > join direktori (dunia sama) > strip.
// Nilai kosong/"-" dilewati agar kolom tak pernah kosong bila datanya ada.
function pickLabel(...vals: (string | undefined | null)[]): string {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s && s !== "-") return s;
  }
  return "-";
}

function readLS(key: string): any[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function normalizeMock(j: (typeof journals)[number]): FeedEntry {
  return {
    id: j.id,
    teacher_id: mockTeachers.find((t) => t.name === j.teacher)?.id,
    teacher: j.teacher,
    class_id: mockClasses.find((c) => c.name === j.class)?.id,
    class: j.class,
    subject_id: mockSubjects.find((s) => s.name === j.subject)?.id,
    subject: j.subject,
    material: j.material,
    date: j.date,
    notes: j.notes,
    photo: j.photo || "",
    signature: j.signature || "",
    teacher_status: "hadir",
    stats: { ...j.stats },
    src: "mock",
  };
}

// Baris mentah backend (snake_case §3) → FeedEntry.
// Label embed diutamakan; join direktori hanya bila dunia sama (ditangani pemanggil).
export function normalizeRemote(r: any, src = "laravel"): FeedEntry {
  return {
    id: String(r.id ?? `r${Date.now()}`),
    teacher_id: r.teacher_id,
    teacher: pickLabel(r.teacher_name, r.teacher === "-" ? undefined : r.teacher),
    class_id: r.class_id,
    class: pickLabel(r.class_name, r.class === "-" ? undefined : r.class),
    subject_id: r.subject_id,
    subject: pickLabel(r.subject_name, r.subject === "-" ? undefined : r.subject),
    material: pickLabel(r.material_text, r.material, r.custom_material),
    date: r.date ?? "",
    notes: r.notes ?? "",
    photo: r.photo ?? r.photo_url ?? "",
    signature: r.signature ?? r.signature_url ?? "",
    teacher_status: r.teacher_status ?? "hadir",
    leave_note: r.leave_note,
    sick_letter_name: r.sick_letter_name ?? (r.sick_letter_url ? String(r.sick_letter_url).split("/").pop() : undefined),
    sick_letter_note: r.sick_letter_note,
    schedule: pickLabel(r.schedule_label, r.schedule, r.schedule_name),
    schedule_id: r.schedule_id,
    schedule_end_id: r.schedule_end_id ?? r.schedule_end ?? null,
    teacher_name: r.teacher_name,
    class_name: r.class_name,
    subject_name: r.subject_name,
    schedule_label: r.schedule_label,
    material_text: r.material_text,
    attendances: r.attendances,
    stats: r.stats ?? r.attendance_summary ?? emptyStats(),
    src,
  };
}

// Feed langsung dari Firestore: journals + agregasi student_attendances (aturan §4.6).
// Firestore tanpa JOIN: ID dipetakan ke nama via direktori di memori.
// Batas baca: since (default awal bulan berjalan, where date>= — tanpa index komposit)
// + sort client + slice limitN. Attendances hanya untuk journal tampil (chunk `in`).
export type FeedDir = { classes: Doc[]; subjects: Doc[]; users: Doc[]; materials: Doc[]; schedules: Doc[] };

export async function getFeedFirestore(limitN = 60, opts?: { since?: string }): Promise<FeedEntry[]> {
  const d = new Date();
  const since = opts?.since ?? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  // Direktori SELALU dibaca dari Firestore yang sama dengan journals (dunia tunggal).
  // Gagal sebagian → list kosong (join dilewati, label embed tetap tampil). Tanpa fallback mock.
  const [all, lists] = await Promise.all([
    listDocs("journals", { wheres: [["date", ">=", since]] }),
    (async (): Promise<FeedDir> => {
      try {
        const [classes, subjects, users, materials, schedules] = await Promise.all([
          listDocs("classes"), listDocs("subjects"), listDocs("users"),
          listDocs("materials"), listDocs("schedules"),
        ]);
        return { classes, subjects, users, materials, schedules };
      } catch {
        return { classes: [], subjects: [], users: [], materials: [], schedules: [] };
      }
    })(),
  ]);
  const { classes: cls, subjects: sub, users: usr, materials: mat, schedules: sch } = lists;
  const js = all
    .sort((a, b) => String(b.created_at || b.date || "").localeCompare(String(a.created_at || a.date || "")))
    .slice(0, limitN);
  const joinName = (list: Doc[], id?: string, field = "name") => {
    if (!id) return "";
    const m = list.find((x) => x.id === id);
    const v = m ? String((m as any)[field] ?? "") : "";
    return v.trim() || "";
  };
  const clsName = (id?: string) => joinName(cls, id) || "-";
  const subName = (id?: string) => joinName(sub, id) || "-";
  const tchName = (id?: string) => joinName(usr, id) || "-";
  const matTitle = (id?: string) => joinName(mat, id, "title");
  const ids = js.map((j) => j.id);
  const atts: Doc[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    if (chunk.length) atts.push(...(await listDocs("student_attendances", { wheres: [["journal_id", "in", chunk]] })));
  }
  const byJ = new Map<string, Doc[]>();
  atts.forEach((a) => {
    const l = byJ.get(a.journal_id) || [];
    l.push(a);
    byJ.set(a.journal_id, l);
  });
  return js.map((j) => {
    const l = byJ.get(j.id) || [];
    const stats = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
    l.forEach((a) => {
      const k = String(a.status || "").toLowerCase() as keyof typeof stats;
      if (k in stats) stats[k]++;
    });
    const base = normalizeRemote(j, "firestore");
    // Embed dulu; join direktori (dunia sama) hanya bila embed kosong.
    const schedLabel = base.schedule !== "-"
      ? base.schedule
      : (j.schedule_id ? rangeLabel(sch, j.schedule_id, j.schedule_end_id) : "") || "-";
    return {
      ...base,
      teacher: base.teacher === "-" && j.teacher_id ? tchName(j.teacher_id) : base.teacher,
      class: base.class === "-" && j.class_id ? clsName(j.class_id) : base.class,
      subject: base.subject === "-" && j.subject_id ? subName(j.subject_id) : base.subject,
      schedule: schedLabel,
      material: base.material || j.custom_material || matTitle(j.material_id) || "-",
      stats: l.length ? stats : base.stats,
      attendances: l.length ? l.map((a) => ({ student_id: a.student_id, status: String(a.status).toLowerCase() })) : base.attendances,
    };
  });
}

// Fallback lokal bila Firestore tak terjangkau (arsip wizard + mock) — satu dunia lokal.
export function getSharedFeed(): FeedEntry[] {
  const mine = readLS("journals-feed");
  const legacy = readLS("my-journals");
  const seen = new Set(mine.map((m: any) => m.id));
  const merged: FeedEntry[] = [
    ...mine.map((m: any) => ({ src: "local", ...m })),
    ...legacy.filter((m: any) => !seen.has(m.id)).map((m: any) => ({ src: "local", ...m })),
    ...journals.map(normalizeMock),
  ];
  return merged.sort((a, b) => b.date.localeCompare(a.date));
}

// Dipanggil wizard saat simpan — feed inilah yang dibaca dashboard admin & kepsek.
export function appendFeed(entry: FeedEntry) {
  if (typeof window === "undefined") return;
  try {
    const prev = readLS("journals-feed");
    localStorage.setItem("journals-feed", JSON.stringify([entry, ...prev]));
  } catch {}
}

export type Summary = {
  guru: { hadir: number; izin: number; sakit: number; belum_isi: number; total: number };
  siswa: { hadir: number; sakit: number; izin: number; alpha: number };
  perTeacher: { teacher_id: string; name: string; mapel: string; submitted_today: boolean; teacher_status: TeacherStatus | null }[];
  perClass: { class_id: string; name: string; hadir: number; sakit: number; izin: number; alpha: number }[];
  guruPie: { name: string; value: number }[];
  siswaPie: { name: string; value: number }[];
  trend: { tanggal: string; hadir: number; sakit: number; izin: number; alpha: number }[];
};

export type Dir = {
  teachers: { id: string; name: string; subject_ids?: string[] }[];
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string; code: string }[];
};
const mockDir: Dir = { teachers: mockTeachers as Dir["teachers"], classes: mockClasses, subjects: mockSubjects };

function mapelOf(id: string | undefined, dir: Dir) {
  if (!id) return "-";
  return dir.teachers.find((t) => t.id === id)?.subject_ids
    ?.map((s) => dir.subjects.find((x) => x.id === s)?.code)
    .filter(Boolean)
    .join(", ") || "-";
}

export function summarizeFeed(feed: FeedEntry[], today: string, month: string, dir: Dir = mockDir): Summary {
  const monthFeed = feed.filter((f) => f.date.startsWith(month));
  const byTeacher = new Map<string, FeedEntry>();
  monthFeed.filter((f) => f.date === today).forEach((f) => {
    if (!byTeacher.has(f.teacher)) byTeacher.set(f.teacher, f);
  });
  const guru = { hadir: 0, izin: 0, sakit: 0 };
  byTeacher.forEach((f) => { guru[f.teacher_status]++; });
  // Roster = direktori ∪ nama guru yang muncul di feed (anti daftar kosong/bias dunia).
  const roster = [...dir.teachers];
  monthFeed.forEach((f) => {
    if (f.teacher !== "-" && !roster.some((t) => t.name === f.teacher || (f.teacher_id && t.id === f.teacher_id))) {
      roster.push({ id: f.teacher_id || `feed:${f.teacher}`, name: f.teacher });
    }
  });
  const total = roster.length;
  const submitted = byTeacher.size;
  const siswa = emptyStats();
  monthFeed.forEach((f) => {
    siswa.hadir += f.stats.hadir; siswa.sakit += f.stats.sakit;
    siswa.izin += f.stats.izin; siswa.alpha += f.stats.alpha;
  });
  const perTeacher = roster.map((t) => {
    const f = byTeacher.get(t.name);
    return { teacher_id: t.id, name: t.name, mapel: mapelOf(t.id, dir), submitted_today: !!f, teacher_status: (f?.teacher_status ?? null) as TeacherStatus | null };
  });
  const cls = new Map<string, { class_id: string; name: string; hadir: number; sakit: number; izin: number; alpha: number }>();
  monthFeed.forEach((f) => {
    const k = f.class || "-";
    if (!cls.has(k)) cls.set(k, { class_id: f.class_id || k, name: k, hadir: 0, sakit: 0, izin: 0, alpha: 0 });
    const c = cls.get(k)!;
    c.hadir += f.stats.hadir; c.sakit += f.stats.sakit; c.izin += f.stats.izin; c.alpha += f.stats.alpha;
  });
  const byDate = new Map<string, { hadir: number; sakit: number; izin: number; alpha: number }>();
  monthFeed.forEach((f) => {
    if (!byDate.has(f.date)) byDate.set(f.date, emptyStats());
    const d = byDate.get(f.date)!;
    d.hadir += f.stats.hadir; d.sakit += f.stats.sakit; d.izin += f.stats.izin; d.alpha += f.stats.alpha;
  });
  const trend = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, s]) => ({ tanggal: date.slice(5), ...s }));
  const gMonth = { hadir: 0, izin: 0, sakit: 0 };
  monthFeed.forEach((f) => { gMonth[f.teacher_status]++; });
  return {
    guru: { ...guru, belum_isi: Math.max(0, total - submitted), total },
    siswa,
    perTeacher,
    perClass: [...cls.values()],
    guruPie: [
      { name: "Hadir", value: gMonth.hadir },
      { name: "Izin", value: gMonth.izin },
      { name: "Sakit", value: gMonth.sakit },
    ],
    siswaPie: [
      { name: "Hadir", value: siswa.hadir },
      { name: "Sakit", value: siswa.sakit },
      { name: "Izin", value: siswa.izin },
      { name: "Alpha", value: siswa.alpha },
    ],
    trend,
  };
}

// Respons GET /admin/dashboard-stats (kontrak) → Summary; trend & pie diisi dari feed.
export function summaryFromRemote(
  s: { guru: { hadir: number; izin: number; sakit: number; belum_isi: number }; siswa: Summary["siswa"]; per_teacher: { teacher_id: string; name: string; submitted_today: boolean; teacher_status: TeacherStatus | null }[]; per_class: { class_id: string; name: string; hadir: number; sakit: number; izin: number; alpha: number }[] },
  feed: FeedEntry[], month: string, dir: Dir = mockDir
): Summary {
  const local = summarizeFeed(feed, "0000-00-00", month, dir);
  const total = s.guru.hadir + s.guru.izin + s.guru.sakit + s.guru.belum_isi;
  return {
    guru: { ...s.guru, total },
    siswa: s.siswa,
    perTeacher: s.per_teacher.map((t) => ({ ...t, mapel: mapelOf(t.teacher_id, dir) })),
    perClass: s.per_class,
    guruPie: [
      { name: "Hadir", value: s.guru.hadir },
      { name: "Izin", value: s.guru.izin },
      { name: "Sakit", value: s.guru.sakit },
    ],
    siswaPie: [
      { name: "Hadir", value: s.siswa.hadir },
      { name: "Sakit", value: s.siswa.sakit },
      { name: "Izin", value: s.siswa.izin },
      { name: "Alpha", value: s.siswa.alpha },
    ],
    trend: local.trend,
  };
}
