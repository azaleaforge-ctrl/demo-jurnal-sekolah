import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AuthProvider } from "@/src/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  // Judul generik (tanpa hardcode nama sekolah — nama dinamis tampil di sidebar).
  title: "Jurnal Sekolah",
  description: "Jurnal mengajar & absensi guru: cepat di HP, rapi di desktop.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
        <Toaster richColors position="top-center" toastOptions={{ style: { borderRadius: 14 } }} />
      </body>
    </html>
  );
}
