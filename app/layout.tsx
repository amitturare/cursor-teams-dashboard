import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI SparkLine — Coditas",
  description: "Team usage insights for Cursor"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Urbanist:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
