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
 * A thin line at the top of every page showing who is signed in and for which account, with the way
 * to settings (ADR-039). It reads /api/me, a Route Handler, so an expired session is refreshed there.
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
  if (hidden || me === null) return null;
  return (
    <div className="account-bar no-print">
      <div className="inner">
        {me === "signed-out" ? (
          <>
            <span className="muted">Not signed in</span>
            <Link href={`/sign-in?next=${encodeURIComponent(path)}`}>Sign in</Link>
          </>
        ) : (
          <>
            <span className="who">
              <strong>{me.account?.account_name ?? "No account"}</strong> <span className="muted">{me.profile?.full_name ?? me.user.email}</span>
            </span>
            <Link href={me.account ? "/settings/account" : "/no-account"}>Settings</Link>
          </>
        )}
      </div>
    </div>
  );
}
