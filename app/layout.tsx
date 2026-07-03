import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Otherside | Command Center",
  description: "Live business dashboard for Otherside",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // No web fonts loaded — the Claude dataviz skill mandates system sans everywhere.
  return (
    <html lang="en">
      <head />
      <body>{children}</body>
    </html>
  );
}
