"use client";
import { useState } from "react";
import { Download, X, ZoomIn, ZoomOut } from "lucide-react";
import { Modal } from "./ui/modal";
import { cn } from "@/src/lib/utils";

// Lightbox inspect: gambar full-res, scroll/zoom sederhana, unduh.
export function Lightbox({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  return (
    <Modal open wide onClose={onClose} title={label}>
      <div className="max-h-[80vh] overflow-auto rounded-2xl bg-slate-100">
        <img
          src={src}
          alt={label}
          onClick={() => setZoom((z) => (z >= 2 ? 1 : z + 0.5))}
          title="Klik untuk perbesar"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
          className="max-h-[80vh] w-full cursor-zoom-in object-contain"
        />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))} className="grid size-10 place-items-center rounded-xl border border-slate-200" title="Perkecil" aria-label="Perkecil">
          <ZoomOut size={17} />
        </button>
        <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.5))} className="grid size-10 place-items-center rounded-xl border border-slate-200" title="Perbesar" aria-label="Perbesar">
          <ZoomIn size={17} />
        </button>
        <a href={src} download={label.replace(/\s+/g, "-").toLowerCase()} className={cn("inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white")}>
          <Download size={15} /> Unduh
        </a>
        <button onClick={onClose} className="grid size-10 place-items-center rounded-xl bg-slate-100" title="Tutup" aria-label="Tutup">
          <X size={17} />
        </button>
      </div>
    </Modal>
  );
}
