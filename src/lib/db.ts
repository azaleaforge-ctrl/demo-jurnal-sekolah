import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  collection, doc, getDoc, getDocs, getCountFromServer, query, where, orderBy, limit,
  addDoc, setDoc, updateDoc, deleteDoc, writeBatch, onSnapshot, type Unsubscribe, type WhereFilterOp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import { users as mockUsers, classes as mockClasses, subjects as mockSubjects, students as mockStudents, schedules as mockSchedules, materials as mockMaterials, school as mockSchool } from "./mock";

export type Doc = { id: string; [k: string]: any };
export type Wheres = [string, WhereFilterOp, any][];

export function nowID() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function needDb() {
  if (!db) throw new Error("Firestore tak terjangkau");
  return db;
}
function needStorage() {
  if (!storage) throw new Error("Storage tak terjangkau");
  return storage;
}
const stripId = (o: any) => { const { id, ...rest } = o || {}; return rest; };
const stamp = (data: any) => { const t = nowID(); return { ...data, created_at: data.created_at ?? t, updated_at: t }; };

// Cache direktori sesi: dibaca sekali, dipakai ulang antar halaman; hangus tiap tulis.
type DirData = { users: Doc[]; classes: Doc[]; subjects: Doc[]; students: Doc[]; schedules: Doc[]; materials: Doc[] };
type DirSources = Directory["sources"];
let dirCache: DirData | null = null;
let dirSources: DirSources | null = null;
function bustDir() { dirCache = null; dirSources = null; }

// ---------- Repo typed per koleksi §2 ----------

export async function listDocs(name: string, opts?: { wheres?: Wheres; order?: [string, "asc" | "desc"]; limitN?: number }): Promise<Doc[]> {
  const d = needDb();
  let q: any = collection(d, name);
  (opts?.wheres || []).forEach(([f, op, v]) => { q = query(q, where(f, op, v)); });
  if (opts?.order) q = query(q, orderBy(opts.order[0], opts.order[1]));
  if (opts?.limitN) q = query(q, limit(opts.limitN));
  const s = await getDocs(q);
  return s.docs.map((x) => ({ id: x.id, ...((x.data() || {}) as Record<string, any>) }));
}

const snapRows = (s: any): Doc[] =>
  s.docs.map((x: any) => ({ id: x.id, ...((x.data() || {}) as Record<string, any>) }));

// Listener realtime 1 koleksi (ganti fetch-once getDocs).
// Melempar sinkron bila db mati agar caller langsung ke fallback; error jaringan → onError.
export function subscribeDocs(
  name: string,
  opts: { wheres?: Wheres; order?: [string, "asc" | "desc"]; limitN?: number } | undefined,
  onData: (rows: Doc[]) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  const d = needDb();
  let q: any = collection(d, name);
  (opts?.wheres || []).forEach(([f, op, v]) => { q = query(q, where(f, op, v)); });
  if (opts?.order) q = query(q, orderBy(opts.order[0], opts.order[1]));
  if (opts?.limitN) q = query(q, limit(opts.limitN));
  return onSnapshot(q, (s: any) => onData(snapRows(s)), (e: any) => onError?.(e));
}

// Listener journals + attendances terkait (chunk `in`, 1 field → tanpa index komposit).
// Perubahan di device A langsung muncul di device B. Kembalikan unsubscribe gabungan.
export function subscribeFeedJournals(
  journalWheres: Wheres,
  onData: (journals: Doc[], attendances: Doc[]) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  const d = needDb();
  let q: any = collection(d, "journals");
  for (const [f, op, v] of journalWheres) q = query(q, where(f, op, v));
  let attUnsub: Unsubscribe | null = null;
  const unsubJ = onSnapshot(q,
    (snap: any) => {
      const js = snapRows(snap);
      const ids = js.map((j) => j.id);
      attUnsub?.(); attUnsub = null;
      if (!ids.length) { onData(js, []); return; }
      const unsubs: Unsubscribe[] = [];
      const acc = new Map<string, Doc[]>();
      const emit = () => onData(js, ids.flatMap((id) => acc.get(id) ?? []));
      for (let i = 0; i < ids.length; i += 30) {
        const chunk = ids.slice(i, i + 30);
        unsubs.push(onSnapshot(
          query(collection(d, "student_attendances"), where("journal_id", "in", chunk)),
          (s2: any) => {
            chunk.forEach((id) => acc.delete(id));
            snapRows(s2).forEach((a) => {
              const jid = String((a as any).journal_id);
              const l = acc.get(jid) || [];
              l.push(a);
              acc.set(jid, l);
            });
            emit();
          },
          (e: any) => onError?.(e),
        ));
      }
      attUnsub = () => unsubs.forEach((u) => u());
    },
    (e: any) => onError?.(e));
  return () => { unsubJ(); attUnsub?.(); };
}

// Listener 6 koleksi direktori inti (gabung jadi 1 snapshot direktori).
export function subscribeDirectory(
  onData: (dir: DirData, sources: DirSources) => void,
  onError?: (e: unknown) => void,
): Unsubscribe {
  const d = needDb();
  const cols = ["users", "classes", "subjects", "students", "schedules", "materials"] as const;
  const acc: Partial<Record<(typeof cols)[number], Doc[]>> = {};
  const mapDoc = (x: any): Doc => ({ id: x.id, ...((x.data() || {}) as Record<string, any>) });
  const emit = () => {
    const pick = (rows: Doc[] | undefined, fb: Doc[]) => (rows && rows.length ? rows : fb);
    const src = (rows: Doc[] | undefined): "firestore" | "mock" => (rows && rows.length ? "firestore" : "mock");
    dirCache = {
      users: pick(acc.users, mockUsers as Doc[]), classes: pick(acc.classes, mockClasses as Doc[]),
      subjects: pick(acc.subjects, mockSubjects as Doc[]), students: pick(acc.students, mockStudents as Doc[]),
      schedules: pick(acc.schedules, mockSchedules as Doc[]), materials: pick(acc.materials, mockMaterials as Doc[]),
    };
    dirSources = {
      users: src(acc.users), classes: src(acc.classes), subjects: src(acc.subjects),
      students: src(acc.students), schedules: src(acc.schedules), materials: src(acc.materials),
    };
    onData(dirCache, dirSources);
  };
  const unsubs = cols.map((c) => onSnapshot(collection(d, c),
    (s: any) => { acc[c] = s.docs.map(mapDoc); if (cols.every((k) => acc[k])) emit(); },
    (e: any) => onError?.(e)));
  return () => unsubs.forEach((u) => u());
}

export async function countDocs(name: string): Promise<number> {
  const s = await getCountFromServer(collection(needDb(), name));
  return s.data().count;
}

export async function addDocTo(name: string, data: any): Promise<string> {
  const r = await addDoc(collection(needDb(), name), stamp(data));
  bustDir();
  return r.id;
}

export async function setDocTo(name: string, id: string, data: any): Promise<void> {
  await setDoc(doc(needDb(), name, id), stamp(data), { merge: true });
  bustDir();
}

export async function updateDocById(name: string, id: string, data: any): Promise<void> {
  await updateDoc(doc(needDb(), name, id), { ...stripId(data), updated_at: nowID() });
  bustDir();
}

export async function removeDoc(name: string, id: string): Promise<void> {
  await deleteDoc(doc(needDb(), name, id));
  bustDir();
}

// Tulis balik absensi per jurnal: hapus batch lama + tulis batch baru (kompensasi §4.6).
export async function rewriteAttendances(journalId: string, items: { student_id: string; status: string }[]): Promise<void> {
  const d = needDb();
  const old = await listDocs("student_attendances", { wheres: [["journal_id", "==", journalId]] });
  const ops: Array<{ t: "del"; id: string } | { t: "set"; data: any }> = [
    ...old.map((o) => ({ t: "del" as const, id: o.id })),
    ...items.map((data) => ({ t: "set" as const, data: { journal_id: journalId, ...data } })),
  ];
  for (let i = 0; i < ops.length; i += 500) {
    const b = writeBatch(d);
    ops.slice(i, i + 500).forEach((op) => {
      if (op.t === "del") b.delete(doc(d, "student_attendances", op.id));
      else b.set(doc(collection(d, "student_attendances")), stamp(op.data));
    });
    await b.commit();
  }
}

// writeBatch ≤500 otomatis di-chunk.
export async function batchAdd(name: string, items: any[]): Promise<number> {
  const d = needDb();
  let n = 0;
  for (let i = 0; i < items.length; i += 500) {
    const b = writeBatch(d);
    items.slice(i, i + 500).forEach((it) => { b.set(doc(collection(d, name)), stamp(it)); });
    await b.commit();
    n += Math.min(500, items.length - i);
  }
  bustDir();
  return n;
}

// Satu commit untuk N operasi campur (set id pradefinisi / set auto-id / delete).
// Dipakai simpan jurnal: 1 journal + ±30 attendances = 1 roundtrip (atomik).
export type BatchOp = { col: string; id?: string; data?: any; del?: boolean };
export async function commitBatch(ops: BatchOp[]): Promise<void> {
  const d = needDb();
  for (let i = 0; i < ops.length; i += 500) {
    const b = writeBatch(d);
    ops.slice(i, i + 500).forEach((op) => {
      const r = op.id ? doc(d, op.col, op.id) : doc(collection(d, op.col));
      if (op.del) b.delete(r);
      else b.set(r, stamp(op.data ?? {}));
    });
    await b.commit();
  }
  bustDir();
}

export type Setting = { school_name: string; academic_year: string; semester: string; principal_name?: string };

export async function getSetting(): Promise<Setting | null> {
  const s = await getDoc(doc(needDb(), "school_settings", "main"));
  return s.exists() ? (s.data() as Setting) : null;
}

export async function saveSetting(s: Setting): Promise<void> {
  await setDocTo("school_settings", "main", s);
}

export async function findUserByEmail(email: string): Promise<Doc | null> {
  const rows = await listDocs("users", { wheres: [["email", "==", email.trim().toLowerCase()]], limitN: 1 });
  return rows[0] || null;
}

// ---------- Storage: foto/TTD/surat ----------

function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Format dataURL tidak valid");
  const bin = atob(m[2]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: m[1] });
}

export async function uploadBlob(path: string, blob: Blob, contentType?: string): Promise<string> {
  const r = ref(needStorage(), path);
  await uploadBytes(r, blob, contentType ? { contentType } : undefined);
  return getDownloadURL(r);
}

export async function uploadDataUrl(path: string, dataUrl: string): Promise<string> {
  const m = /^data:(.+?);/.exec(dataUrl);
  return uploadBlob(path, dataUrlToBlob(dataUrl), m?.[1]);
}

export async function uploadFile(path: string, file: File): Promise<string> {
  return uploadBlob(path, file, file.type || undefined);
}

// SEMUA media → UploadThing dulu (kontrak §1+§5); gagal/token kosong → lempar
// agar caller fallback Firebase Storage (path lama) → dataURL + toast.
async function utUpload(endpoint: "imageUploader" | "docUploader", file: File): Promise<string> {
  const { uploadFiles } = await import("./uploadthing");
  const res = await uploadFiles(endpoint, { files: [file] });
  const url = res?.[0]?.url;
  if (!url) throw new Error("UploadThing tidak mengembalikan URL");
  return url;
}

// FOTO bukti jurnal → UploadThing (URL utfs.io → photo_url).
export async function uploadPhotoJournal(blob: Blob): Promise<string> {
  return utUpload("imageUploader", new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
}

// TTD (dataURL PNG 600×200) → UploadThing image.
export async function uploadSignature(dataUrl: string): Promise<string> {
  const m = /^data:(.+?);/.exec(dataUrl);
  return utUpload("imageUploader", new File([dataUrlToBlob(dataUrl)], `ttd-${Date.now()}.png`, { type: m?.[1] || "image/png" }));
}

// Surat sakit (pdf/jpg/png) → UploadThing doc.
export async function uploadSickLetter(file: File): Promise<string> {
  return utUpload("docUploader", file);
}

// ---------- Hooks ----------

export function useCollection<T extends Doc>(name: string, opts?: { wheres?: Wheres; order?: [string, "asc" | "desc"]; fallback?: T[] }) {
  const [rows, setRows] = useState<T[]>(opts?.fallback ?? []);
  const [loading, setLoading] = useState(true);
  const [remote, setRemote] = useState(false);
  const toasted = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const unsubRef = useRef<Unsubscribe | null>(null);

  // Realtime: tulis di device A langsung muncul di device B (unsubscribe rapi).
  const attach = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    setLoading(true);
    const fail = () => {
      if (optsRef.current?.fallback) setRows(optsRef.current.fallback as T[]);
      setRemote(false);
      setLoading(false);
      if (!toasted.current) { toasted.current = true; toast.info("Mode demo — memakai data lokal."); }
    };
    try {
      unsubRef.current = subscribeDocs(name, optsRef.current, (data) => {
        setRows(data as T[]);
        setRemote(true);
        setLoading(false);
      }, fail);
    } catch {
      fail();
    }
  }, [name]);

  const refresh = useCallback(async () => { attach(); }, [attach]);

  useEffect(() => { attach(); return () => { unsubRef.current?.(); unsubRef.current = null; }; }, [attach]);

  const persist = useMemo(() => ({
    create: async (item: any): Promise<string> => {
      if (remote) {
        const id = await addDocTo(name, stripId(item));
        return id;
      }
      return `x${Date.now()}`;
    },
    update: async (id: string, item: any): Promise<void> => {
      if (remote) await updateDocById(name, id, item);
    },
    remove: async (id: string): Promise<void> => {
      if (remote) await removeDoc(name, id);
    },
  }), [remote, name]);

  return { rows, setRows, loading, remote, refresh, persist };
}

export type Directory = {
  users: Doc[]; classes: Doc[]; subjects: Doc[]; students: Doc[];
  schedules: Doc[]; materials: Doc[]; loading: boolean; remote: boolean;
  // Sumber per koleksi (firestore|mock) — anti join silang dunia.
  sources: Record<"users" | "classes" | "subjects" | "students" | "schedules" | "materials", "firestore" | "mock">;
};

const mockSources = {
  users: "mock", classes: "mock", subjects: "mock",
  students: "mock", schedules: "mock", materials: "mock",
} as Directory["sources"];

// Satu hook direktori untuk dropdown + agregasi (fallback mock per koleksi).
// Realtime via subscribeDirectory; cache sesi tetap ditulis agar getDocs lain hemat.

export function useDirectory(): Directory {
  const [dir, setDir] = useState({ users: mockUsers as Doc[], classes: mockClasses as Doc[], subjects: mockSubjects as Doc[], students: mockStudents as Doc[], schedules: mockSchedules as Doc[], materials: mockMaterials as Doc[] });
  const [loading, setLoading] = useState(!dirCache);
  const [remote, setRemote] = useState(!!dirCache);
  const [sources, setSources] = useState<DirSources>(dirSources ?? mockSources);
  const toasted = useRef(false);
  useEffect(() => {
    let on = true;
    if (dirCache) { setDir(dirCache); setRemote(true); setSources(dirSources ?? mockSources); setLoading(false); }
    let unsub: (() => void) | null = null;
    const fail = () => {
      if (!on) return;
      setSources(mockSources);
      setLoading(false);
      if (!toasted.current) { toasted.current = true; toast.info("Mode demo — memakai data lokal."); }
    };
    try {
      // Realtime: perubahan master di device A langsung tampil di device B.
      unsub = subscribeDirectory((d, s) => {
        if (!on) return;
        setDir(d); setRemote(true); setSources(s); setLoading(false);
      }, fail);
    } catch {
      fail();
    }
    return () => { on = false; unsub?.(); };
  }, []);
  return { ...dir, loading, remote, sources };
}

export function mockSetting() {
  return { school_name: mockSchool.name, academic_year: mockSchool.academicYear, semester: mockSchool.semester.toLowerCase(), principal_name: (mockSchool as any).principalName || "Drs. Haryanto" };
}
