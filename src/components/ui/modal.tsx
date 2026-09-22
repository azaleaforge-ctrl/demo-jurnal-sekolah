"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

export function Modal({ open, onClose, title, children, danger, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; danger?: boolean; wide?: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className={wide ? "w-full max-w-3xl rounded-t-3xl bg-white p-6 sm:rounded-3xl" : "w-full max-w-md rounded-t-3xl bg-white p-6 sm:rounded-3xl"}
          >
            <div className="flex items-center gap-3">
              {danger && <span className="grid size-10 place-items-center rounded-full bg-rose-100 text-rose-600"><AlertTriangle size={20} /></span>}
              <h3 className="font-display text-lg font-bold">{title}</h3>
            </div>
            <div className="mt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmModal({ open, onClose, onYes, text }: { open: boolean; onClose: () => void; onYes: () => void; text: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Hapus data?" danger>
      <p className="text-sm text-slate-600">{text}</p>
      <div className="mt-5 flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose}>Batal</Button>
        <Button variant="danger" className="flex-1" onClick={onYes}>Ya, hapus</Button>
      </div>
    </Modal>
  );
}
