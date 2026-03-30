import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cursor Team Usage Dashboard",
  description: "Minimal monthly team usage insights for Cursor"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
