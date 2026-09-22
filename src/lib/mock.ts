export type Role = "admin" | "guru" | "kepsek";

export const school = {
  name: "SMK Nusantara Cerdas",
  academicYear: "2025/2026",
  semester: "Ganjil" as "Ganjil" | "Genap",
};

export const classes = [
  { id: "k1", name: "X RPL 1" },
  { id: "k2", name: "X RPL 2" },
  { id: "k3", name: "XI TKJ 1" },
  { id: "k4", name: "XII MM 1" },
];

export const subjects = [
  { id: "m1", name: "Matematika", code: "MTK" },
  { id: "m2", name: "Pemrograman Web", code: "PWEB" },
  { id: "m3", name: "Bahasa Indonesia", code: "BIND" },
  { id: "m4", name: "PKN", code: "PKN" },
];

export const schedules = [
  { id: "j1", name: "Jam 1 (07.00 – 07.45)", order: 1 },
  { id: "j2", name: "Jam 2 (07.45 – 08.30)", order: 2 },
  { id: "j3", name: "Jam 3 (08.30 – 09.15)", order: 3 },
  { id: "j4", name: "Jam 4 (09.30 – 10.15)", order: 4 },
];

export const materials = [
  { id: "a1", subject_id: "m2", title: "HTML & Struktur Dokumen" },
  { id: "a2", subject_id: "m2", title: "CSS Flexbox & Grid" },
  { id: "a3", subject_id: "m1", title: "Fungsi Kuadrat" },
  { id: "a4", subject_id: "m3", title: "Teks Eksposisi" },
];

export const students = [
  { id: "s1", nisn: "001", name: "Ayu Lestari", class_id: "k1" },
  { id: "s2", nisn: "002", name: "Budi Santoso", class_id: "k1" },
  { id: "s3", nisn: "003", name: "Citra Dewi", class_id: "k1" },
  { id: "s4", nisn: "004", name: "Dimas Prasetyo", class_id: "k1" },
  { id: "s5", nisn: "005", name: "Eka Putri", class_id: "k1" },
  { id: "s6", nisn: "006", name: "Fajar Ramadhan", class_id: "k2" },
  { id: "s7", nisn: "007", name: "Gita Ayu", class_id: "k2" },
  { id: "s8", nisn: "008", name: "Hendra Gunawan", class_id: "k3" },
];

export const teachers = [
  { id: "g1", name: "Rina Marlina", email: "rinamarlina@smknusantaracerdas.id", subject_ids: ["m2"] },
  { id: "g2", name: "Agus Wijaya", email: "aguswijaya@smknusantaracerdas.id", subject_ids: ["m1"] },
  { id: "g3", name: "Siti Rahma", email: "sitirahma@smknusantaracerdas.id", subject_ids: ["m3"] },
];

export const users = [
  { id: "u1", name: "Admin Sekolah", email: "admin@sekolah.id", role: "admin" as Role },
  ...teachers.map((t) => ({ id: t.id, name: t.name, email: t.email, role: "guru" as Role })),
  { id: "u9", name: "Drs. Haryanto", email: "kepsek@sekolah.id", role: "kepsek" as Role },
];

export const journals = [
  {
    id: "jr1", teacher: "Rina Marlina", class: "X RPL 1", subject: "Pemrograman Web",
    material: "HTML & Struktur Dokumen", date: "2026-09-18",
    notes: "Praktik membuat struktur HTML + validasi form.",
    photo: "", signature: "",
    stats: { hadir: 28, sakit: 1, izin: 1, alpha: 0 },
  },
  {
    id: "jr2", teacher: "Agus Wijaya", class: "X RPL 2", subject: "Matematika",
    material: "Fungsi Kuadrat", date: "2026-09-19",
    notes: "Latihan grafik fungsi kuadrat dengan diskusi kelompok.",
    photo: "", signature: "",
    stats: { hadir: 26, sakit: 2, izin: 0, alpha: 1 },
  },
];

export const attendanceTrend = [
  { hari: "Sen", hadir: 120, sakit: 4, izin: 3, alpha: 1 },
  { hari: "Sel", hadir: 118, sakit: 5, izin: 2, alpha: 2 },
  { hari: "Rab", hadir: 122, sakit: 2, izin: 4, alpha: 0 },
  { hari: "Kam", hadir: 115, sakit: 6, izin: 3, alpha: 3 },
  { hari: "Jum", hadir: 110, sakit: 3, izin: 5, alpha: 1 },
];

export const attendancePie = [
  { name: "Hadir", value: 560 },
  { name: "Sakit", value: 18 },
  { name: "Izin", value: 15 },
  { name: "Alpha", value: 6 },
];
