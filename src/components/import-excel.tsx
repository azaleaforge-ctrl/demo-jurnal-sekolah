"use client";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
import { Table } from "./ui/table";
import { downloadRemote } from "@/src/lib/api";

export type ImportResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Widget impor generik: unduh template (backend → fallback lokal), parse .xlsx/.csv,
// pratinjau valid + baris error, konfirmasi gabung.
// Ketat: hanya kolom `pick` yang dibaca (case-insensitive, trim); kolom lain diabaikan.
export function ImportExcel<T extends Record<string, any>>({
  templateUrl,
  templateName,
  templateHeaders,
  templateExample,
  pick,
  mapRow,
  previewHead,
  toPreviewRow,
  onConfirm,
}: {
  templateUrl: string;
  templateName: string;
  templateHeaders: string[];
  templateExample: (string | number)[][];
  pick?: string[];
  mapRow: (row: Record<string, any>) => ImportResult<T>;
  previewHead: string[];
  toPreviewRow: (t: T) => string[];
  onConfirm: (valid: T[], file: File) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [valid, setValid] = useState<T[]>([]);
  const [errors, setErrors] = useState<{ row: number; message: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function download() {
    if (await downloadRemote(templateUrl, templateName)) {
      toast.success("Template diunduh.");
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([templateHeaders, ...templateExample]);
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, templateName);
    toast.success("Template diunduh (salinan lokal).");
  }

  async function onFile(f: File) {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    if (!json.length) {
      toast.error("File kosong — isi dulu sesuai template.");
      return;
    }
    const v: T[] = [];
    const e: { row: number; message: string }[] = [];
    json.forEach((r, i) => {
      const norm: Record<string, any> = {};
      Object.entries(r).forEach(([k, val]) => {
        const key = String(k).trim().toLowerCase();
        if (pick && !pick.includes(key)) return;
        norm[key] = typeof val === "string" ? val.trim() : val;
      });
      const res = mapRow(norm);
      if (res.ok) v.push(res.data);
      else e.push({ row: i + 2, message: res.error });
    });
    setFile(f);
    setValid(v);
    setErrors(e);
    setOpen(true);
  }

  async function confirm() {
    if (!file || !valid.length) {
      toast.error("Tidak ada baris valid untuk diimpor.");
      return;
    }
    setBusy(true);
    try {
      await onConfirm(valid, file);
    } finally {
      setBusy(false);
      setOpen(false);
      setValid([]);
      setErrors([]);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const shown = valid.slice(0, 10);

  return (
    <>
      <Button variant="outline" className="max-sm:flex-1" onClick={download}>
        <Download size={15} /> Template
      </Button>
      <Button variant="outline" className="max-sm:flex-1" onClick={() => inputRef.current?.click()}>
        <Upload size={15} /> Upload Excel/CSV
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      <Modal open={open} onClose={() => setOpen(false)} title="Pratinjau impor">
        <p className="text-sm text-slate-600">
          <b className="text-emerald-600">{valid.length} baris masuk</b>
          {errors.length > 0 && <span> · <b className="text-rose-600">{errors.length} dilewati</b></span>}
        </p>
        {errors.length > 0 && (
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto rounded-xl bg-rose-50 p-2.5 text-xs text-rose-700">
            {errors.map((e) => <li key={e.row}>Baris {e.row}: {e.message}</li>)}
          </ul>
        )}
        {shown.length > 0 && (
          <div className="mt-3">
            <Table head={previewHead}>
              {shown.map((t, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  {toPreviewRow(t).map((c, j) => <td key={j} className="px-4 py-2">{c}</td>)}
                </tr>
              ))}
            </Table>
            {valid.length > 10 && <p className="mt-1 text-xs text-slate-400">+ {valid.length - 10} baris valid lainnya.</p>}
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)}>Batal</Button>
          <Button className="flex-1" disabled={busy || !valid.length} onClick={confirm}>
            {busy && <Loader2 size={15} className="animate-spin" />} Konfirmasi Impor ({valid.length})
          </Button>
        </div>
      </Modal>
    </>
  );
}
