"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface Me {
  user: { email: string };
  account: { account_name: string; role: string } | null;
  profile: { full_name: string | null } | null;
}

const AUTH_PAGES = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/no-account"];

/**
 * A thin line at the top of every page: the RhoeFlow name back home, the way to load calcs and to
 * settings, and who is signed in for which account (ADR-039). It reads /api/me, a Route Handler, so
 * an expired session is refreshed there.
 */
export function AccountBar() {
  const path = usePathname() ?? "/";
  const [me, setMe] = useState<Me | null | "signed-out">(null);
  const hidden = AUTH_PAGES.some((p) => path.startsWith(p));
  useEffect(() => {
    if (hidden) return;
    let live = true;
    fetch("/api/me", { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (r.status === 401) return setMe("signed-out");
        if (r.ok) setMe((await r.json()) as Me);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hidden, path]);
  if (hidden) return null;
  const here = (prefix: string) => (prefix === "/" ? path === "/" || path.startsWith("/p/") || path.startsWith("/r/") : path.startsWith(prefix));
  const nav = (href: string, label: string, prefix = href) => (
    <Link href={href} className={`nav${here(prefix) ? " on" : ""}`} aria-current={here(prefix) ? "page" : undefined}>
      {label}
    </Link>
  );
  const signedIn = me !== null && me !== "signed-out";
  return (
    <div className="account-bar no-print">
      <div className="inner">
        <nav className="links" aria-label="RhoeFlow">
          <Link href="/" className="brand-link">
            RhoeFlow
          </Link>
          {signedIn && me.account ? (
            <>
              {nav("/", "Load calcs")}
              {nav("/templates", "Templates")}
            </>
          ) : null}
        </nav>
        {me === null ? null : me === "signed-out" ? (
          <span className="links">
            <span className="muted">Not signed in</span>
            <Link href={`/sign-in?next=${encodeURIComponent(path)}`}>Sign in</Link>
          </span>
        ) : (
          <span className="links">
            <span className="who">
              <strong>{me.account?.account_name ?? "No account"}</strong> <span className="muted">{me.profile?.full_name ?? me.user.email}</span>
            </span>
            {me.account ? nav("/settings/account", "Settings", "/settings") : <Link href="/no-account">Settings</Link>}
          </span>
        )}
      </div>
    </div>
  );
}
