import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doppler API Probe",
  description: "Vercel-Cloudflare ECONNRESET diagnostic tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
