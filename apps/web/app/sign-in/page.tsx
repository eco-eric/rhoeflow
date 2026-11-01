import { AuthShell, DevNotice } from "../../components/auth-shell";
import { publicAuthConfig } from "../../lib/auth-config";
import { devMemoryEnabled } from "../../lib/dev";
import { safeNext } from "../../lib/session";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

/** Sign in with a RhoeFlow login: email and password, or an emailed code (ADR-039). */
export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const config = publicAuthConfig();
  return (
    <AuthShell title="Sign in">
      {devMemoryEnabled() ? <DevNotice /> : null}
      {one("error") === "link" ? <div className="issue error" role="alert">That email link didn&apos;t work. It may have been used already or expired. Sign in, or ask for a new link.</div> : null}
      {one("signed_out") ? <p className="muted">You&apos;re signed out.</p> : null}
      {config ? <SignInForm config={config} next={safeNext(one("next"))} /> : <div className="issue error">Sign-in is not set up on this server yet.</div>}
    </AuthShell>
  );
}
