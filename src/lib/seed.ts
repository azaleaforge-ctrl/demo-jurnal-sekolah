import { countDocs, batchAdd, setDocTo, listDocs, addDocTo } from "./db";
import { slugEmail } from "./utils";

export type SeedProgress = (done: number, total: number, label: string) => void;

const FIRST = ["Ayu", "Budi", "Citra", "Dimas", "Eka", "Fajar", "Gita", "Hendra", "Indra", "Joko", "Kirana", "Lukman", "Maya", "Nanda", "Oscar", "Putri", "Raka", "Sari", "Tono", "Utami", "Vina", "Wahyu", "Yoga", "Zahra", "Dewi", "Agus", "Rina", "Doni", "Fitri", "Hadi", "Irma", "Bagus", "Nina", "Rudi", "Sinta", "Andi", "Lestari", "Fikri", "Wulan", "Galih"];
const LAST = ["Lestari", "Santoso", "Dewi", "Prasetyo", "Putri", "Ramadhan", "Ayu", "Gunawan", "Saputra", "Wijaya", "Kusuma", "Nugroho", "Rahmawati", "Setiawan", "Hidayat", "Anggraini"];
const KELAS = ["X RPL 1", "X RPL 2", "XI RPL 1", "X TKJ 1", "XI TKJ 1", "XII MM 1"];
const MAPEL: [string, string][] = [
  ["Matematika", "MTK"], ["Pemrograman Web", "PWEB"], ["Bahasa Indonesia", "BIND"],
  ["Pendidikan Kewarganegaraan", "PKN"], ["Pendidikan Agama", "PAI"], ["Sejarah", "SEJ"],
  ["Bahasa Inggris", "BING"], ["Fisika", "FIS"], ["Kimia", "KIM"], ["PJOK", "PJOK"],
];
const MATERI: Record<string, string[]> = {
  MTK: ["Fungsi Kuadrat", "Trigonometri Dasar", "Limit Fungsi", "Statistika"],
  PWEB: ["HTML & Struktur Dokumen", "CSS Flexbox & Grid", "JavaScript Dasar", "Form & Validasi"],
  BIND: ["Teks Eksposisi", "Teks Negosiasi", "Cerpen", "Tata Bahasa Baku"],
  PKN: ["Pancasila sebagai Ideologi", "UUD 1945", "Demokrasi Indonesia"],
  PAI: ["Akhlak Mulia", "Fiqih Ibadah", "Sejarah Kebudayaan Islam"],
  SEJ: ["Kolonialisme di Indonesia", "Pergerakan Nasional", "Proklamasi"],
  BING: ["Descriptive Text", "Simple Past Tense", "Offering Help"],
  FIS: ["Gerak Lurus", "Hukum Newton", "Usaha & Energi"],
  KIM: ["Struktur Atom", "Ikatan Kimia", "Larutan Asam Basa"],
  PJOK: ["Atletik Lari Jarak Pendek", "Permainan Bola Besar", "Kebugaran Jasmani"],
};
const GURU = ["Rina Marlina", "Agus Wijaya", "Siti Rahma", "Dewi Lestari", "Bambang Sutrisno", "Ratna Sari", "Hendra Pratama", "Yuni Astuti", "Dedi Kurniawan", "Maya Puspita", "Rudi Hartono", "Nina Kurnia", "Fajar Nugroho", "Lina Marlina"];
const JAM = ["07.00 - 07.45", "07.45 - 08.30", "08.30 - 09.15", "09.30 - 10.15", "10.15 - 11.00", "11.00 - 11.45", "12.30 - 13.15", "13.15 - 14.00"];

const randPw = () => Math.random().toString(36).slice(2, 12);

// Idempotent: lewati koleksi yang sudah berisi.
export async function runSeed(onProgress: SeedProgress): Promise<{ skipped: string[]; added: Record<string, number> }> {
  const skipped: string[] = [];
  const added: Record<string, number> = {};
  const total = 9;
  let done = 0;
  const step = (label: string) => { done++; onProgress(done, total, label); };

  // school_settings
  const hasSetting = (await listDocs("school_settings", { limitN: 1 })).length > 0;
  if (!hasSetting) {
    await setDocTo("school_settings", "main", { school_name: "SMK Nusantara Cerdas", academic_year: "2025/2026", semester: "ganjil" });
    added.school_settings = 1;
  } else skipped.push("school_settings");
  step("Pengaturan sekolah");

  // classes
  const classIds: Record<string, string> = {};
  if ((await countDocs("classes")) === 0) {
    const ids = await Promise.all(KELAS.map((name) => addDocTo("classes", { name })));
    KELAS.forEach((n, i) => { classIds[n] = ids[i]; });
    added.classes = KELAS.length;
  } else {
    (await listDocs("classes")).forEach((c) => { classIds[c.name] = c.id; });
    skipped.push("classes");
  }
  step("Kelas");

  // students: 6 kelas × 30
  if ((await countDocs("students")) === 0) {
    const combos: string[] = [];
    FIRST.forEach((f) => LAST.forEach((l) => { if (f !== l) combos.push(`${f} ${l}`); }));
    let k = 0;
    const items: any[] = [];
    KELAS.forEach((kls) => {
      for (let i = 0; i < 30; i++) {
        k++;
        items.push({
          nisn: `10${String(k).padStart(8, "0")}`,
          name: combos[(k * 7) % combos.length],
          class_id: classIds[kls] || kls,
        });
      }
    });
    added.students = await batchAdd("students", items);
  } else skipped.push("students");
  step("Siswa");

  // subjects
  const subjectIds: Record<string, string> = {};
  if ((await countDocs("subjects")) === 0) {
    for (const [name, code] of MAPEL) {
      subjectIds[code] = await addDocTo("subjects", { name, code });
    }
    added.subjects = MAPEL.length;
  } else {
    (await listDocs("subjects")).forEach((s) => { subjectIds[s.code] = s.id; });
    skipped.push("subjects");
  }
  step("Mata pelajaran");

  // materials 3-4/mapel
  if ((await countDocs("materials")) === 0) {
    const items: any[] = [];
    Object.entries(MATERI).forEach(([code, titles]) => {
      titles.forEach((title) => items.push({ subject_id: subjectIds[code] || code, title }));
    });
    added.materials = await batchAdd("materials", items);
  } else skipped.push("materials");
  step("Materi");

  // schedules 8 slot
  if ((await countDocs("schedules")) === 0) {
    added.schedules = await batchAdd("schedules", JAM.map((t, i) => ({ name: `Jam ${i + 1} (${t})`, order: i + 1 })));
  } else skipped.push("schedules");
  step("Jam mengajar");

  // users: 14 guru + admin + kepsek
  if ((await countDocs("users")) === 0) {
    const items: any[] = GURU.map((name, i) => {
      const code = MAPEL[i % MAPEL.length][1];
      return {
        name, email: slugEmail(name, "SMK Nusantara Cerdas"), role: "guru",
        password: randPw(), subject_ids: [subjectIds[code] || code],
      };
    });
    items.push({ name: "Admin Sekolah", email: "admin@sekolah.id", role: "admin", password: randPw() });
    items.push({ name: "Drs. Haryanto", email: "kepsek@sekolah.id", role: "kepsek", password: randPw() });
    added.users = await batchAdd("users", items);
  } else skipped.push("users");
  step("Akun pengguna");

  step("Selesai");
  return { skipped, added };
}
