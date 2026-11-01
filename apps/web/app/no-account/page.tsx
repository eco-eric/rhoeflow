import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isStoreError } from "@rhoeflow/store";
import { AuthShell } from "../../components/auth-shell";
import { SignOutButton } from "../../components/sign-out-button";
import { accountsDb } from "../../lib/accounts";
import { requireSignedIn } from "../../lib/context";
import { sessionState } from "../../lib/session";
import { CheckInvites } from "./check-invites";

export const dynamic = "force-dynamic";

/**
 * A login that belongs to no account sees nothing else (ADR-039 decision 8). It can check again for
 * invites (the admin may have added this email since) or sign out.
 */
export default async function NoAccountPage() {
  const url = process.env["SUPABASE_URL"];
  if (url) {
    const jar = await cookies();
    const state = await sessionState((n) => jar.get(n)?.value, url);
    if (state === "none") redirect("/sign-in");
    if (state === "stale") redirect("/auth/refresh?next=%2Fno-account");
  }
  let email = "";
  try {
    const who = await requireSignedIn();
    if (await accountsDb(who).whoami(who.user_id)) redirect("/");
    email = who.email;
  } catch (e) {
    if (isStoreError(e) && e.details?.["reason"] === "no_session") redirect("/sign-in");
    throw e;
  }
  return (
    <AuthShell title="You're not part of an account yet">
      <div className="panel">
        <p>You&apos;re signed in as <strong>{email}</strong>, but no RhoeFlow account has invited this email.</p>
        <p className="muted">Ask your company&apos;s RhoeFlow admin to invite exactly this address under Settings, Account. Then check again here.</p>
        <CheckInvites />
      </div>
      <SignOutButton />
    </AuthShell>
  );
}
