// Slot mengajar guru: koleksi schedules berisi 2 daftar (kind mulai/selesai).
// Opsi tampil = pasangan se-order "Jam N (mulai - selesai)"; nilai = id dokumen mulai.
// Toleran: dok lama tanpa kind (nama rentang) tampil apa adanya; sisa tak berpasangan ikut tampil.

export type SlotDoc = { id: string; name?: string; time?: string; kind?: string; order?: number };
export type SlotOption = { id: string; label: string; order: number };

const num = (o?: number, fb = 999) => (typeof o === "number" ? o : fb);

export function pairSlots(docs: SlotDoc[]): SlotOption[] {
  const out: SlotOption[] = [];
  const fresh = docs.filter((d) => d.kind === "mulai" || d.kind === "selesai");
  const legacy = docs.filter((d) => !d.kind);
  const byOrder = new Map<number, { m?: SlotDoc; s?: SlotDoc }>();
  fresh.forEach((d) => {
    const o = num(d.order);
    if (!byOrder.has(o)) byOrder.set(o, {});
    const g = byOrder.get(o)!;
    if (d.kind === "mulai" && !g.m) g.m = d;
    else if (d.kind === "selesai" && !g.s) g.s = d;
    else out.push({ id: d.id, label: d.name || `${d.kind} ${d.time || ""}`.trim(), order: o });
  });
  [...byOrder.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([o, g]) => {
      if (g.m && g.s) out.push({ id: g.m.id, label: `Jam ${o} (${g.m.time || "?"} - ${g.s.time || "?"})`, order: o });
      else if (g.m) out.push({ id: g.m.id, label: g.m.time ? `Jam ${o} mulai (${g.m.time})` : g.m.name || `Jam ${o}`, order: o });
      else if (g.s) out.push({ id: g.s.id, label: g.s.time ? `Jam ${o} selesai (${g.s.time})` : g.s.name || `Jam ${o}`, order: o });
    });
  legacy
    .sort((a, b) => num(a.order) - num(b.order))
    .forEach((d) => out.push({ id: d.id, label: d.name || "Jam", order: num(d.order) }));
  return out.sort((a, b) => a.order - b.order);
}

export function slotLabel(docs: SlotDoc[], id?: string): string {
  if (!id) return "";
  return pairSlots(docs).find((o) => o.id === id)?.label || docs.find((d) => d.id === id)?.name || "";
}

// --- Jam ganda: schedule_id (MULAI) + schedule_end_id (SELESAI, nullable legacy) ---

export type SlotItem = { id: string; label: string; order: number };

// Dropdown Jam Mulai: kind=mulai + dok lama (nama rentang, end tidak wajib bila ini dipilih).
export function mulaiOptions(docs: SlotDoc[]): SlotItem[] {
  return docs
    .filter((d) => !d.kind || d.kind === "mulai")
    .map((d) => ({
      id: d.id,
      label: d.kind ? `Jam ${num(d.order)} mulai (${d.time || "?"})` : d.name || "Jam",
      order: num(d.order),
    }))
    .sort((a, b) => a.order - b.order);
}

// Dropdown Jam Selesai: kind=selesai saja.
export function selesaiOptions(docs: SlotDoc[]): SlotItem[] {
  return docs
    .filter((d) => d.kind === "selesai")
    .map((d) => ({ id: d.id, label: `Jam ${num(d.order)} (${d.time || "?"})`, order: num(d.order) }))
    .sort((a, b) => a.order - b.order);
}

// Selesai harus sesudah mulai: bandingkan order, fallback string time.
export function compareSlots(a?: SlotDoc, b?: SlotDoc): number {
  const oa = num(a?.order);
  const ob = num(b?.order);
  if (oa !== ob) return oa - ob;
  return String(a?.time || "").localeCompare(String(b?.time || ""));
}

// Tampil "mulai - selesai" di preview/feed/riwayat/export; toleran legacy tanpa end.
export function rangeLabel(docs: SlotDoc[], mulaiId?: string, endId?: string): string {
  const m = docs.find((d) => d.id === mulaiId);
  if (!m) return "";
  if (!m.kind) return m.name || "";
  const t = (d?: SlotDoc) => d?.time || d?.name || "?";
  if (!endId) return `${t(m)} (mulai)`;
  const s = docs.find((d) => d.id === endId);
  if (!s) return t(m);
  return `${t(m)} - ${t(s)}`;
}
