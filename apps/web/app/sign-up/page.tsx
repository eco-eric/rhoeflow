import { AuthShell, DevNotice } from "../../components/auth-shell";
import { publicAuthConfig } from "../../lib/auth-config";
import { devMemoryEnabled } from "../../lib/dev";
import { safeNext } from "../../lib/session";
import { SignUpForm } from "./sign-up-form";

export const dynamic = "force-dynamic";

/**
 * Make a RhoeFlow login (ADR-039 decision 7). RhoeFlow accounts are by invitation for now: a login
 * joins an account when its confirmed email matches an invite from that account's admin.
 */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const config = publicAuthConfig();
  return (
    <AuthShell title="Make a login">
      {devMemoryEnabled() ? <DevNotice /> : null}
      <p className="muted">RhoeFlow is by invitation. Use the email your company&apos;s RhoeFlow admin invited; you join their account once you confirm it.</p>
      {config ? <SignUpForm config={config} next={safeNext(typeof sp["next"] === "string" ? sp["next"] : undefined)} /> : <div className="issue error">Sign-up is not set up on this server yet.</div>}
    </AuthShell>
  );
}
