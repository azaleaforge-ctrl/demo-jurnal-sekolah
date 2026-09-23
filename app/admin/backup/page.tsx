"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, Download, Eye, RotateCcw, ShieldCheck } from "lucide-react";
import { Guard, useAuth } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card, Stat } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Table } from "@/src/components/ui/table";
import { Badge, Empty } from "@/src/components/ui/misc";
import { Modal } from "@/src/components/ui/modal";
import {
  backupFolder, backupStoragePath, backupZipName, buildBackupStats, buildMonthZip, canArchive,
  deleteStorageUrl, estimateMonthZip, formatBytes, formatEta, isBackupCancelled, listArchiveMonths, monthLabel,
  monthRange, pastUnsealedMonths, prevMonth, sealFiles, sealStatus, tempArchiveId, uploadBackupZip,
} from "@/src/lib/backup";
import { type ExportDir } from "@/src/lib/export";
import { byNewest, getSharedFeed, mapJournalEntry, type FeedEntry } from "@/src/lib/feed";
import {
  getSetting, mockSetting, nowID, removeDoc, setDocTo,
  subscribeFeedJournals, useCollection, useDirectory, type Doc,
} from "@/src/lib/db";
import { todayID } from "@/src/lib/utils";

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.split("/").pop() || filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function AdminBackupPage() {
  const today = todayID();
  const { user } = useAuth();
  const dir = useDirectory();
  const archives = useCollection<Doc>("archives", { order: ["month", "desc"] });
  // Penanda reset-permanen: auto-seal melewati bulan-bulan ini selamanya.
  const resets = useCollection<Doc>("archive_resets", { order: ["month", "desc"] });
  // Arsip sementara (copy per bulan dilihat, boleh bulan berjalan).
  const temps = useCollection<Doc>("temp_archives", { order: ["createdAt", "desc"] });
  const [bulan, setBulan] = useState(() => prevMonth(today.slice(0, 7)));
  const [viewed, setViewed] = useState<{ month: string; dari: string; sampai: string } | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [sch, setSch] = useState(mockSetting());
  const [busy, setBusy] = useState(false);
  const [zipProg, setZipProg] = useState<{ done: number; total: number; t0: number; bytes: number; phase?: string } | null>(null);
  const [sealing, setSealing] = useState(false);
  // Satu popup konfirmasi untuk semua aksi hapus/batal/destruktif (tanpa window.confirm).
  type Ask = { title: string; body: string; yes: string; no?: string; danger?: boolean; run: () => void };
  const [confirm, setConfirm] = useState<Ask | null>(null);
  // Flag abortive: dicek tiap file + tiap yield UI selama generate ZIP.
  const abortRef = useRef(false);

  // Tombol Batal di modal progres → konfirmasi dulu; "Lanjut Unduh" menutup
  // popup ini saja (progres terus jalan, tanpa reset); "Ya, Batalkan" set flag.
  function batalZip() {
    setConfirm({
      title: "Batalkan unduhan?",
      body: "Yakin batalkan unduhan? Progres akan hilang.",
      yes: "Ya, Batalkan",
      no: "Lanjut Unduh",
      run: () => {
        abortRef.current = true;
        setZipProg((p) => (p ? { ...p, phase: "Membatalkan…" } : p));
      },
    });
  }

  // Realtime sejak awal bulan terpilih — histori tampil di sini, bukan di dashboard.
  useEffect(() => {
    if (dir.loading) return;
    let on = true;
    let unsub: (() => void) | null = null;
    try {
      unsub = subscribeFeedJournals([["date", ">=", `${bulan}-01`]],
        (js, atts) => {
          if (!on) return;
          const d = { classes: dir.classes, subjects: dir.subjects, users: dir.users, materials: dir.materials, schedules: dir.schedules };
          setFeed(js.map((j) => mapJournalEntry(j, d, atts)).sort(byNewest));
        },
        () => { if (on) { setFeed(getSharedFeed()); toast.info("Mode demo — memakai data lokal."); } });
    } catch { setFeed(getSharedFeed()); }
    getSetting()
      .then((s) => { if (s) setSch({ school_name: s.school_name, academic_year: s.academic_year, semester: s.semester.toLowerCase() === "genap" ? "Genap" : "Ganjil", principal_name: s.principal_name }); })
      .catch(() => {});
    return () => { on = false; unsub?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir.loading, dir, bulan]);

  const xdir: ExportDir = useMemo(() => ({
    school: { name: sch.school_name, academicYear: sch.academic_year, semester: sch.semester.toLowerCase() === "genap" ? "Genap" : "Ganjil", principalName: (sch as any).principal_name },
    students: dir.students.map((s) => ({ id: s.id, nisn: s.nisn, name: s.name, class_id: s.class_id })),
    classes: dir.classes.map((c) => ({ id: c.id, name: c.name, wali: (c as any).wali })),
    teachers: dir.users.filter((u) => u.role === "guru").map((t) => ({ id: t.id, name: t.name })),
  }), [dir, sch]);

  const rows = useMemo(() => {
    if (!viewed) return [];
    return feed
      .filter((f) => f.date >= viewed.dari && f.date <= viewed.sampai)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [feed, viewed]);
  const stats = useMemo(
    () => (viewed ? buildBackupStats(feed, viewed.dari, viewed.sampai) : null),
    [feed, viewed],
  );
  const sealed = viewed ? archives.rows.find((a) => a.id === viewed.month) : undefined;
  const tempCount = viewed ? temps.rows.filter((t) => (t as any).month === viewed.month).length : 0;
  const months = useMemo(() => listArchiveMonths(feed).slice(0, 6), [feed]);

  function lihat() {
    try {
      const { dari, sampai } = monthRange(bulan);
      setViewed({ month: bulan, dari, sampai });
    } catch (e: any) {
      toast.error(e.message || "Bulan tidak valid.");
    }
  }

  // Baris feed untuk bulan apa pun (dipakai unduh/ZIP per baris tabel).
  function monthRows(m: string): FeedEntry[] {
    try {
      const { dari, sampai } = monthRange(m);
      return feed
        .filter((f) => f.date >= dari && f.date <= sampai)
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }

  // Arsip Sementara: salinan (copy) bulan yang sedang dilihat — BOLEH bulan
  // berjalan. Satu bulan boleh punya beberapa arsip (id unik per waktu).
  // Hanya menulis copy; journals/attendances sumber tidak disentuh.
  // Konfirmasi dulu via popup (tanpa eksekusi langsung).
  function arsipSementara() {
    if (!viewed || !stats) return toast.error("Tekan Lihat terlebih dahulu.");
    if (!stats.journals) return toast.error("Tidak ada jurnal pada periode ini.");
    const v = viewed;
    const s = stats;
    setConfirm({
      title: "Buat arsip sementara?",
      body: `Salin ${monthLabel(v.month)} (${s.journals} jurnal) sebagai arsip sementara? Data sumber tidak diubah.`,
      yes: "Ya, Simpan",
      run: () => arsipSementaraExec(v.month, v.dari, v.sampai, s),
    });
  }

  async function arsipSementaraExec(month: string, dari: string, sampai: string, s: NonNullable<typeof stats>) {
    setSealing(true);
    try {
      const id = tempArchiveId(month);
      await setDocTo("temp_archives", id, {
        month, dari, sampai,
        counts: s, createdBy: user?.email || user?.name || "admin",
        createdAt: nowID(),
      });
      toast.success(`Arsip sementara ${monthLabel(month)} tersimpan (copy, sumber utuh).`);
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan arsip sementara.");
    } finally {
      setSealing(false);
    }
  }

  // Hapus satu copy arsip sementara (per baris) — popup sebut nama baris,
  // sumber tidak disentuh.
  function hapusTemp(id: string, label: string) {
    setConfirm({
      title: "Hapus arsip sementara?",
      body: `"${label}" — salinan ini akan dihapus, data sumber tetap aman.`,
      yes: "Ya, Hapus",
      danger: true,
      run: () => hapusTempExec(id),
    });
  }

  async function hapusTempExec(id: string) {
    try {
      await removeDoc("temp_archives", id);
      toast.success("Copy arsip sementara dihapus.");
    } catch (e: any) {
      toast.error(e.message || "Gagal menghapus.");
    }
  }

  // Reset beda per tingkat — data sumber bulan itu tak pernah dihapus.
  // Segel sementara bulanan: hapus doc segel saja (auto-seal bisa membuatnya lagi).
  // Permanen: konfirmasi ganda via popup (dipertahankan) → hapus file Storage
  // + doc segel + tandai archive_resets agar auto-seal melewatinya selamanya.
  async function resetRow(m: string) {
    const a = archives.rows.find((x) => x.id === m);
    if (!a) return toast.error("Belum ada segel arsip untuk bulan ini.");
    if (sealStatus(a) === "final") {
      const f = sealFiles(a);
      setConfirm({
        title: "Hapus permanen?",
        body: `Hapus PERMANEN arsip ${monthLabel(m)}? File ZIP${f ? ` (${formatBytes(f.sizeBytes)})` : ""} di Storage ikut terhapus.`,
        yes: "Lanjut",
        danger: true,
        run: () => setConfirm({
          title: "Yakin hapus permanen?",
          body: "Segel permanen TIDAK dibuat ulang otomatis. Data jurnal bulan itu tetap utuh.",
          yes: "Ya, Hapus Permanen",
          danger: true,
          run: () => resetFinalExec(m, f?.zipUrl),
        }),
      });
      return;
    }
    setConfirm({
      title: "Hapus segel arsip?",
      body: `Segel arsip ${monthLabel(m)} akan dihapus. Journals asli tetap utuh.`,
      yes: "Ya, Hapus",
      danger: true,
      run: () => resetSealExec(m),
    });
  }

  async function resetFinalExec(m: string, zipUrl?: string) {
    try {
      try {
        if (zipUrl) await deleteStorageUrl(zipUrl);
      } catch (e: any) {
        if (!String(e?.code || e?.message || "").includes("object-not-found")) {
          return toast.error("Gagal menghapus file Storage — dibatalkan.");
        }
      }
      await removeDoc("archives", m);
      await setDocTo("archive_resets", m, {
        month: m, resetAt: nowID(),
        resetBy: user?.email || user?.name || "admin", level: "final",
      });
      toast.success("Arsip permanen dihapus (data jurnal tetap utuh).");
    } catch (e: any) {
      toast.error(e.message || "Gagal mereset permanen.");
    }
  }

  async function resetSealExec(m: string) {
    try {
      await removeDoc("archives", m);
      toast.success("Segel arsip dihapus (data jurnal tidak berubah).");
    } catch (e: any) {
      toast.error(e.message || "Gagal mereset arsip.");
    }
  }

  // Simpan Permanen (admin) per bulan: konfirmasi popup dulu, lalu generate
  // ZIP → upload ke backups/YYYY-MM/ → segel jadi final + files{...}.
  // Bulan tanpa data di feed → buka dulu (Lihat) agar datanya termuat.
  async function permanenRow(m: string) {
    const a = archives.rows.find((x) => x.id === m);
    if (!a) return toast.error("Bulan ini belum tersegel di Backup Data Bulanan.");
    if (sealStatus(a) === "final") return toast.error("Bulan ini sudah permanen.");
    const list = monthRows(m);
    if (!list.length) {
      jumpSeal(m);
      return toast.info(`Membuka ${monthLabel(m)} — tekan lagi setelah data tampil.`);
    }
    if (busy) return;
    setConfirm({
      title: "Simpan permanen?",
      body: `Arsip ${monthLabel(m)} (${list.length} jurnal) akan digenerate ZIP lalu di-upload ke Storage; tombol unduh jadi instan.`,
      yes: "Ya, Simpan",
      run: () => permanenExec(m, list),
    });
  }

  async function permanenExec(m: string, list: FeedEntry[]) {
    setBusy(true);
    abortRef.current = false;
    const t0 = Date.now();
    let acc = 0;
    setZipProg({ done: 0, total: 0, t0, bytes: 0 });
    try {
      const { dari, sampai } = monthRange(m);
      const r = await buildMonthZip({
        bulan: m, dari, sampai,
        rows: list, dir: xdir,
        onFile: (d, t, b) => { acc += b ?? 0; setZipProg({ done: d, total: t, t0, bytes: acc }); },
        shouldAbort: () => abortRef.current,
      });
      setZipProg({ done: r.files, total: r.files, t0, bytes: r.blob.size, phase: "Mengunggah ke Storage…" });
      const url = await uploadBackupZip(m, r.blob);
      await setDocTo("archives", m, {
        status: "final",
        files: {
          zipUrl: url, sizeBytes: r.blob.size,
          finalizedAt: nowID(), finalizedBy: user?.email || user?.name || "admin",
        },
      });
      toast.success(`Permanen tersimpan (${formatBytes(r.blob.size)}). Unduhan kini instan.`);
    } catch (e: any) {
      if (isBackupCancelled(e)) toast.info("Unduhan dibatalkan.");
      else toast.error(e.message || "Gagal menyimpan permanen.");
    } finally {
      setBusy(false);
      setZipProg(null);
    }
  }

  // Auto-seal (tanpa cron): bulan penuh yang lewat + ada data + belum disegel
  // → segel otomatis createdBy "system-auto" (tanpa file, data asli utuh).
  // Hanya membuat yang hilang — tak pernah menimpa segel manual.
  const autoSealed = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!feed.length || archives.loading || resets.loading) return;
    const cands = pastUnsealedMonths(
      feed,
      [...archives.rows.map((a) => a.id), ...autoSealed.current],
      new Date(),
      resets.rows.map((a) => a.id),
    );
    if (!cands.length) return;
    let on = true;
    (async () => {
      for (const m of cands) {
        try {
          const { dari, sampai } = monthRange(m);
          await setDocTo("archives", m, {
            month: m, dari, sampai, counts: buildBackupStats(feed, dari, sampai),
            createdBy: "system-auto", createdAt: nowID(), status: "sealed",
          });
          if (on) autoSealed.current.add(m);
        } catch { /* coba lagi saat feed/arsip berubah */ }
      }
    })();
    return () => { on = false; };
  }, [feed, archives.rows, archives.loading, resets.rows, resets.loading]);

  function jumpSeal(m: string) {
    setBulan(m);
    try {
      const { dari, sampai } = monthRange(m);
      setViewed({ month: m, dari, sampai });
    } catch {}
  }

  // Unduh ZIP per bulan: permanen → langsung pakai zipUrl (instan);
  // sementara (bulanan maupun arsip-temp) → generate + popup progres.
  // Bulan tanpa data di feed → buka dulu agar datanya termuat.
  async function runZipFor(m: string) {
    const a = archives.rows.find((x) => x.id === m);
    const perm = sealFiles(a);
    if (perm) {
      const el = document.createElement("a");
      el.href = perm.zipUrl;
      el.target = "_blank";
      el.rel = "noopener";
      el.click();
      toast.success(`Membuka file permanen (${formatBytes(perm.sizeBytes)}).`);
      return;
    }
    const list = monthRows(m);
    if (!list.length) {
      jumpSeal(m);
      return toast.info(`Membuka ${monthLabel(m)} — tekan Unduh lagi setelah data tampil.`);
    }
    if (busy) return;
    setBusy(true);
    abortRef.current = false;
    const t0 = Date.now();
    let acc = 0;
    setZipProg({ done: 0, total: 0, t0, bytes: 0 });
    try {
      const { dari, sampai } = monthRange(m);
      const r = await buildMonthZip({
        bulan: m, dari, sampai,
        rows: list, dir: xdir,
        onFile: (d, t, b) => { acc += b ?? 0; setZipProg({ done: d, total: t, t0, bytes: acc }); },
        shouldAbort: () => abortRef.current,
      });
      saveBlob(r.blob, backupZipName(m));
      toast.success(`ZIP ${r.files} file · ${formatBytes(r.blob.size)} diunduh.`);
    } catch (e: any) {
      if (isBackupCancelled(e)) toast.info("Unduhan dibatalkan.");
      else toast.error(e.message || "Gagal membuat file.");
    } finally {
      setBusy(false);
      setZipProg(null);
    }
  }

  const est = useMemo(
    () => (viewed ? estimateMonthZip(feed, viewed.dari, viewed.sampai) : null),
    [feed, viewed],
  );
  const eta = useMemo(() => {
    if (!zipProg || zipProg.done < 3 || zipProg.total < 1) return null;
    const el = (Date.now() - zipProg.t0) / 1000;
    if (el < 1) return null;
    return formatEta(((zipProg.total - zipProg.done) / zipProg.done) * el);
  }, [zipProg]);

  return (
    <Guard roles={["admin"]}>
      <AppShell role="admin" title="Backup Bulanan" hint="Segel arsip per bulan — journals asli tidak pernah dihapus">
        <Card>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm font-semibold text-slate-700 sm:max-w-xs">Bulan
              <input type="month" value={bulan} max={today.slice(0, 7)} onChange={(e) => setBulan(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal" />
            </label>
            <Button variant="outline" onClick={lihat}><Eye size={15} /> Lihat</Button>
            <Button onClick={arsipSementara} disabled={sealing}><Archive size={15} /> {sealing ? "Menyimpan…" : "Arsip Sementara"}</Button>
            <Button variant="outline" disabled={!viewed || !sealed} onClick={() => viewed && resetRow(viewed.month)}><RotateCcw size={15} /> Reset</Button>
          </div>
          {!!months.length && (
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              <span className="py-1 font-semibold text-slate-500">Ada di feed:</span>
              {months.map((m) => (
                <button key={m} onClick={() => { setBulan(m); }} className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600 hover:bg-brand-50 hover:text-brand-600">
                  {monthLabel(m)}
                </button>
              ))}
            </div>
          )}
          {viewed && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span><b>{monthLabel(viewed.month)}</b> · {viewed.dari} – {viewed.sampai}</span>
              <span className="text-slate-300">·</span><span><b>{stats?.journals ?? 0}</b> jurnal</span>
              {tempCount > 0 && <><span className="text-slate-300">·</span><span><b>{tempCount}</b> arsip sementara</span></>}
              {sealed
                ? (sealStatus(sealed) === "final"
                  ? <><Badge tone="green">Permanen</Badge><span className="text-xs text-slate-500">· {sealFiles(sealed) ? formatBytes(sealFiles(sealed)!.sizeBytes) : ""} · unduhan instan</span></>
                  : <Badge tone="green">tersegel oleh {String((sealed as any).createdBy || "?")}</Badge>)
                : canArchive(viewed.month)
                  ? <Badge tone="amber">belum disegel bulanan</Badge>
                  : <Badge tone="blue">bulan berjalan — bisa Arsip Sementara</Badge>}
            </div>
          )}
        </Card>

        {!!temps.rows.length && (
          <Card className="mt-4">
            <h2 className="font-display font-bold">Arsip Sementara</h2>
            <p className="mt-0.5 text-xs text-slate-500">Copy bulan yang dilihat (termasuk bulan berjalan) — hapus per baris hanya hapus copy.</p>
            <div className="mt-3">
              <Table head={["Bulan", "Disimpan", "Jurnal", "Oleh", "Aksi"]}>
                {temps.rows.map((t) => {
                  const m = String((t as any).month || "");
                  const c = (t as any).counts;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 font-semibold">{monthLabel(m)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{String((t as any).createdAt || "-")}</td>
                      <td className="px-4 py-3">{c?.journals ?? "?"}</td>
                      <td className="px-4 py-3 text-xs">{String((t as any).createdBy || "-")}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button disabled={busy} onClick={() => runZipFor(m)}
                            className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">Unduh</button>
                          <button onClick={() => hapusTemp(t.id, monthLabel(m))}
                            className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-600">Hapus</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          </Card>
        )}

        {!viewed ? (
          <div className="mt-4"><Empty title="Pilih bulan lalu tekan Lihat" hint="Arsip hanya untuk bulan yang sudah selesai." /></div>
        ) : !rows.length ? (
          <div className="mt-4"><Empty title="Tidak ada jurnal pada bulan ini" hint="Coba bulan lain dari jalan pintas di atas." /></div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Jurnal" value={String(stats?.journals ?? 0)} hint={`${stats?.teachers ?? 0} guru · ${stats?.classes ?? 0} kelas`} />
              <Stat label="Hadir" value={String(stats?.hadir ?? 0)} hint="Siswa" />
              <Stat label="S/I" value={`${stats?.sakit ?? 0}/${stats?.izin ?? 0}`} hint="Sakit / Izin" />
              <Stat label="Alpha" value={String(stats?.alpha ?? 0)} hint="Butuh tindak lanjut" />
            </div>
            <Card className="mt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display font-bold">Backup data {monthLabel(viewed.month)}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    1 file ZIP (<b>{backupZipName(viewed.month)}</b>) berisi folder{" "}
                    <b>{backupFolder(viewed.month)}/Guru/…</b> + <b>Siswa/…</b> —
                    rekap bulanan (xlsx+pdf, prefix 00) + harian Excel/PDF per
                    tanggal berdata (tanpa foto, kolom jadi &quot;Ada&quot;).
                    {est && sealStatus(sealed) !== "final" && (
                      <> Estimasi <b>±{formatBytes(est.estBytes)}</b> · {est.files} file
                        ({est.teachers} guru, {est.classes} kelas).</>
                    )}
                    {sealed && sealStatus(sealed) === "final" && sealFiles(sealed) && (
                      <> Tersimpan permanen di <b>{backupStoragePath(viewed.month)}</b>{" "}
                        ({formatBytes(sealFiles(sealed)!.sizeBytes)}) — unduhan instan.</>
                    )}
                  </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  <Button className="flex-1 sm:flex-none" disabled={busy} onClick={() => viewed && runZipFor(viewed.month)}>
                    <Download size={15} /> {sealed && sealStatus(sealed) === "final" ? "Unduh Permanen (.zip)" : "Unduh Backup Bulan (.zip)"}
                  </Button>
                  {sealed && sealStatus(sealed) !== "final" && (
                    <Button variant="outline" className="flex-1 sm:flex-none" disabled={busy || sealing} onClick={() => viewed && permanenRow(viewed.month)}>
                      <ShieldCheck size={15} /> Simpan Permanen
                    </Button>
                  )}
                </div>
              </div>
            </Card>
            <Card className="mt-4">
              <h2 className="font-display font-bold">Pratinjau — {monthLabel(viewed.month)}</h2>
              <div className="mt-3">
                <Table head={["Tanggal", "Guru", "Kelas", "H", "S", "I", "A"]}>
                  {rows.slice(0, 50).map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">{j.date}</td>
                      <td className="px-4 py-3 font-semibold">{j.teacher}</td>
                      <td className="px-4 py-3">{j.class}</td>
                      <td className="px-4 py-3">{j.stats.hadir}</td>
                      <td className="px-4 py-3">{j.stats.sakit}</td>
                      <td className="px-4 py-3">{j.stats.izin}</td>
                      <td className="px-4 py-3">{j.stats.alpha}</td>
                    </tr>
                  ))}
                </Table>
                {rows.length > 50 && <p className="mt-2 text-xs text-slate-400">Menampilkan 50 dari {rows.length} jurnal — unduh file untuk versi lengkap.</p>}
              </div>
            </Card>
          </>
        )}

        <Card className="mt-4">
          <h2 className="font-display font-bold">Cara kerja</h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li><b>Arsip Sementara</b> = salinan (copy) bulan yang sedang dilihat — <b>boleh bulan berjalan</b>, satu bulan boleh punya beberapa. Hapus per baris hanya menghapus copy itu; data sumber (journals/attendances) tidak disentuh.</li>
            <li><b>Backup Data Bulanan</b> = bulan lewat yang tersegel otomatis (system-auto) + permanen. Unduh per baris: generate ulang untuk sementara, link langsung untuk permanen.</li>
          </ul>
        </Card>

        {!!archives.rows.length && (
          <Card className="mt-4">
            <h2 className="font-display font-bold">Backup Data Bulanan</h2>
            <p className="mt-0.5 text-xs text-slate-500">Bulan lewat yang tersegel (otomatis/manual) + permanen — klik bulan untuk buka.</p>
            <div className="mt-3">
              <Table head={["Bulan", "Status", "Jurnal", "Aksi"]}>
                {archives.rows.map((a) => {
                  const fin = sealStatus(a) === "final";
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <button onClick={() => jumpSeal(a.id)} title={`Buka ${monthLabel(a.id)}`} className="font-semibold hover:text-brand-600">
                          {monthLabel(a.id)}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {fin ? <Badge tone="green">Permanen</Badge> : <Badge tone="green">Sementara</Badge>}
                          {(a as any).createdBy === "system-auto" && !fin && <Badge tone="blue">auto</Badge>}
                        </span>
                      </td>
                      <td className="px-4 py-3">{String((a as any).counts?.journals ?? "?")}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button disabled={busy} onClick={() => runZipFor(a.id)}
                            className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">Unduh</button>
                          {!fin && (
                            <button disabled={busy} onClick={() => permanenRow(a.id)}
                              className="rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-600 disabled:opacity-50">Permanen</button>
                          )}
                          <button onClick={() => resetRow(a.id)}
                            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">
                            {fin ? "Reset permanen" : "Reset"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          </Card>
        )}
        <Modal open={zipProg !== null} onClose={() => {}} title="Mohon tunggu, backup sedang berjalan">
          {zipProg && (
            <div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${zipProg.total ? Math.round((zipProg.done / zipProg.total) * 100) : 0}%` }} />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {zipProg.done}/{zipProg.total} file · {formatBytes(zipProg.bytes)}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {zipProg.phase ? zipProg.phase : eta ? `Estimasi ${eta} lagi —` : "Estimasi 1–3 menit (mengukur kecepatan…) —"}{" "}
                jangan tutup halaman ini.
              </p>
              <div className="mt-4 flex justify-end">
                <Button variant="outline" onClick={batalZip}>Batal</Button>
              </div>
            </div>
          )}
        </Modal>
        <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm?.title ?? ""} danger={confirm?.danger}>
          <p className="text-sm text-slate-600">{confirm?.body}</p>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirm(null)}>{confirm?.no ?? "Batal"}</Button>
            <Button variant={confirm?.danger ? "danger" : undefined} className="flex-1" onClick={() => { const c = confirm; setConfirm(null); c?.run(); }}>{confirm?.yes ?? "Ya"}</Button>
          </div>
        </Modal>
      </AppShell>
    </Guard>
  );
}
