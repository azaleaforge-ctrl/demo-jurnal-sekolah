import { createUploadthing, type FileRouter } from "uploadthing/next";

// Token dibaca per-request dari env server UPLOADTHING_TOKEN (jangan hardcode).
// Tanpa token, route melempar saat dipanggil — build tetap lolos, client fallback Firebase.
const f = createUploadthing();

export const ourFileRouter = {
  // Foto bukti jurnal + TTD (PNG 600×200): 1 file gambar, maks 4MB (§1 + §5).
  imageUploader: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
    .middleware(async () => ({}))
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),
  // Surat sakit klinik/RS: pdf atau gambar, maks 2MB, 1 file.
  docUploader: f({ pdf: { maxFileSize: "2MB", maxFileCount: 1 }, image: { maxFileSize: "2MB", maxFileCount: 1 } })
    .middleware(async () => ({}))
    .onUploadComplete(async ({ file }) => ({ url: file.ufsUrl })),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;
