import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "RhoeFlow Pro",
  description: "TruFicient Energy Solutions' in-house Manual J / S / D load, equipment and duct design app",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#0b1f2a", color: "#e8f1f5" }}>{children}</body>
    </html>
  );
}
