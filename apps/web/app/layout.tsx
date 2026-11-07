import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountBar } from "../components/account-bar";
import { NativeShell } from "../components/native-shell";
import { THEME_SCRIPT } from "../lib/theme";
import "./globals.css";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1319" },
  ],
};

export const metadata: Metadata = {
  title: "RhoeFlow Pro",
  description: "TruFicient Energy Solutions' in-house Manual J / S / D load, equipment and duct design app",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-theme is set before paint by THEME_SCRIPT (ADR-042), so React may find it already there.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AccountBar />
        {children}
        <NativeShell />
      </body>
    </html>
  );
}
