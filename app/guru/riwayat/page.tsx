"use client";
import { useEffect, useState } from "react";
import { FileText, Printer, ImageIcon, PenLine } from "lucide-react";
import { Guard, useAuth } from "@/src/lib/auth";
import { AppShell } from "@/src/components/layout";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Badge, Empty, Skeleton } from "@/src/components/ui/misc";
import { journals } from "@/src/lib/mock";
import { Lightbox } from "@/src/components/lightbox";
import { listDocs, useDirectory } from "@/src/lib/db";
import { slotLabel } from "@/src/lib/slots";
import type { SavedJournal } from "../jurnal-baru/page";

type Row = Omit<SavedJournal, "teacher"> & { teacher: string };

const tone = (s: string) => (s === "hadir" ? "green" : s === "izin" ? "blue" : "amber");

export default function RiwayatPage() {
  const { user } = useAuth();
  const dir = useDirectory();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState<{ src: string; label: string } | null>(null);

  useEffect(() => {
    if (dir.loading) return;
    (async () => {
      let mine: Row[] = [];
      try {
        mine = JSON.parse(localStorage.getItem("my-journals") || "[]");
      } catch {}
      const seen = new Set(mine.map((m) => m.id));
      const clsName = (id?: string) => dir.classes.find((c) => c.id === id)?.name || "-";
      const subName = (id?: string) => dir.subjects.find((s) => s.id === id)?.name || "-";
      const schName = (id?: string) => slotLabel(dir.schedules, id) || undefined;
      try {
        // Riwayat pribadi: journals where teacher_id = saya
        const js = user?.id
          ? await listDocs("journals", { wheres: [["teacher_id", "==", user.id]] })
          : [];
        const remote: Row[] = js
          .filter((j) => !seen.has(j.id))
          .map((j) => {
            const stats = { hadir: 0, sakit: 0, izin: 0, alpha: 0 };
            (j.attendances || []).forEach((a: any) => {
              const k = String(a.status || "").toLowerCase() as keyof typeof stats;
              if (k in stats) stats[k]++;
            });
            return {
              id: j.id, teacher: user?.name || "Saya",
              class: clsName(j.class_id), subject: subName(j.subject_id),
              material: j.material || j.custom_material || "", date: j.date || "",
              notes: j.notes || "", photo: j.photo_url || "", signature: j.signature_url || "",
              teacher_status: j.teacher_status || "hadir",
              leave_note: j.leave_note, sick_letter_name: j.sick_letter_url ? String(j.sick_letter_url).split("/").pop() : undefined,
              sick_letter_note: j.sick_letter_note, stats,
              class_id: j.class_id, subject_id: j.subject_id, teacher_id: j.teacher_id,
              schedule: schName(j.schedule_id), schedule_id: j.schedule_id, attendances: j.attendances,
            } as Row;
          });
        const fallback = mine.length || remote.length ? [] : journals.map((j) => ({
          ...j, teacher_status: "hadir" as const, leave_note: undefined,
          sick_letter_name: undefined, sick_letter_note: undefined,
        }));
        setRows([...mine, ...remote, ...fallback].sort((a, b) => b.date.localeCompare(a.date)));
      } catch {
        const fallback = mine.length ? [] : journals.map((j) => ({
          ...j, teacher_status: "hadir" as const, leave_note: undefined,
          sick_letter_name: undefined, sick_letter_note: undefined,
        }));
        setRows([...mine, ...fallback].sort((a, b) => b.date.localeCompare(a.date)));
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, user?.name, dir.loading]);

  if (loading) {
    return (
      <Guard roles={["guru"]}>
        <AppShell role="guru" title="Riwayat Jurnal" hint="Semua jurnal yang pernah tersimpan">
          <div className="space-y-2"><Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /></div>
        </AppShell>
      </Guard>
    );
  }
  if (!rows.length) {
    return (
      <Guard roles={["guru"]}>
        <AppShell role="guru" title="Riwayat Jurnal" hint="Semua jurnal yang pernah tersimpan">
          <Empty title="Belum ada jurnal" hint="Isi jurnal pertama lewat menu Jurnal Baru." />
        </AppShell>
      </Guard>
    );
  }
  return (
    <Guard roles={["guru"]}>
      <AppShell role="guru" title="Riwayat Jurnal" hint="Lengkap dengan foto, materi & TTD">
        <div className="no-print mb-3 flex justify-end">
          <Button variant="outline" onClick={() => window.print()}><Printer size={15} /> Cetak PDF</Button>
        </div>
        <div className="space-y-3">
          {rows.map((j) => (
            <Card key={j.id} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-bold">{j.subject} · {j.class}</h2>
                <Badge tone="blue">{j.date}</Badge>
                <Badge tone={tone(j.teacher_status) as any}>Saya: {j.teacher_status}</Badge>
                <Badge tone="green">H:{j.stats.hadir}</Badge>
                <Badge tone="amber">S:{j.stats.sakit}</Badge>
                <Badge tone="blue">I:{j.stats.izin}</Badge>
                <Badge tone="red">A:{j.stats.alpha}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-500">{j.material} · oleh {j.teacher}</p>
              <p className="mt-2 text-sm leading-relaxed">{j.notes}</p>
              {j.teacher_status === "izin" && j.leave_note && (
                <p className="mt-2 rounded-xl bg-sky-50 p-2.5 text-sm text-sky-800">Keterangan izin: {j.leave_note}</p>
              )}
              {j.teacher_status === "sakit" && (
                <div className="mt-2 rounded-xl bg-amber-50 p-2.5 text-sm text-amber-800">
                  <p className="flex items-center gap-1.5 font-semibold"><FileText size={14} /> Surat sakit: {j.sick_letter_name || "terlampir"}</p>
                  {j.sick_letter_note && <p className="mt-1">{j.sick_letter_note}</p>}
                </div>
              )}
              <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
                <div className="grid min-w-0 place-items-center overflow-hidden rounded-2xl bg-slate-100 text-xs text-slate-400">
                  {j.photo ? (
                    <button type="button" onClick={() => setZoom({ src: j.photo, label: `Foto — ${j.subject} ${j.class}` })} title="Klik untuk perbesar" className="block w-full min-w-0 overflow-hidden rounded-2xl">
                      <img src={j.photo} alt="bukti" className="aspect-[16/10] max-h-40 w-full cursor-zoom-in object-cover" />
                    </button>
                  ) : (
                    <span className="flex aspect-[16/10] max-h-40 w-full items-center justify-center gap-1.5"><ImageIcon size={14} /> Foto bukti</span>
                  )}
                </div>
                <div className="grid min-w-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-xs text-slate-400">
                  {j.signature ? (
                    <button type="button" onClick={() => setZoom({ src: j.signature, label: `Tanda tangan — ${j.subject} ${j.class}` })} title="Klik untuk perbesar" className="block w-full min-w-0 overflow-hidden rounded-2xl bg-white">
                      <img src={j.signature} alt="ttd" className="h-20 w-full cursor-zoom-in bg-white object-contain" />
                    </button>
                  ) : (
                    <span className="flex h-20 w-full items-center justify-center gap-1.5"><PenLine size={14} /> Tanda tangan</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
        {zoom && <Lightbox src={zoom.src} label={zoom.label} onClose={() => setZoom(null)} />}
      </AppShell>
    </Guard>
  );
}
