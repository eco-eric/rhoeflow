import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const viewport = { width: "device-width", initialScale: 1 };

export const metadata: Metadata = {
  title: "RhoeFlow Pro",
  description: "TruFicient Energy Solutions' in-house Manual J / S / D load, equipment and duct design app",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
