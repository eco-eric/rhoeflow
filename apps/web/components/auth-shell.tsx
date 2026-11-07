import Link from "next/link";
import type { ReactNode } from "react";

/** The narrow card the sign-in, sign-up and password pages share. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="wrap auth-wrap">
      <p className="muted brand">RhoeFlow Pro</p>
      <h1>{title}</h1>
      {children}
      <p className="fine" style={{ marginTop: 24 }}>
        <Link href="/privacy">Privacy policy</Link>
      </p>
    </main>
  );
}

export function DevNotice() {
  return (
    <div className="issue">
      This server runs the development memory store, so there is no sign-in: you are the development account&apos;s admin. <a href="/">Go home</a>.
    </div>
  );
}
