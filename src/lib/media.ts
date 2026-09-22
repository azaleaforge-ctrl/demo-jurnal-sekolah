// Normalisasi media sebelum simpan/kirim — TTD & foto selalu beresolusi tetap.

export const SIG_W = 600;
export const SIG_H = 200;
export const PHOTO_MAX = 1280;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// TTD hasil trim → kanvas TETAP 600x200, bg putih, contain, center.
export function normalizeSignature(trimmed: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  out.width = SIG_W;
  out.height = SIG_H;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SIG_W, SIG_H);
  const scale = Math.min(SIG_W / trimmed.width, SIG_H / trimmed.height);
  const w = Math.max(1, Math.round(trimmed.width * scale));
  const h = Math.max(1, Math.round(trimmed.height * scale));
  ctx.drawImage(trimmed, Math.round((SIG_W - w) / 2), Math.round((SIG_H - h) / 2), w, h);
  return out.toDataURL("image/png");
}

// Foto → batasi sisi panjang 1280px, orientasi mengikuti data terkompresi.
export async function normalizePhoto(dataUrl: string, maxSide = PHOTO_MAX): Promise<string> {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1) return dataUrl;
  const out = document.createElement("canvas");
  out.width = Math.round(img.naturalWidth * scale);
  out.height = Math.round(img.naturalHeight * scale);
  out.getContext("2d")!.drawImage(img, 0, 0, out.width, out.height);
  return out.toDataURL("image/jpeg", 0.85);
}
