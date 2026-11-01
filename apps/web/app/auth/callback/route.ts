import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseAccountsDb } from "@rhoeflow/store/supabase";
import { supabaseForRequest } from "../../../lib/supabase-server";
import { safeNext } from "../../../lib/session";

export const dynamic = "force-dynamic";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * GET /auth/callback: where Supabase's emails land (confirm sign-up, reset password, confirm a new
 * email address; ADR-039). Accepts either the PKCE `code` or a `token_hash` with its `type`, sets the
 * session cookies, accepts any pending invites for the now-confirmed address, then goes to `next`
 * (same site only). A bad or used link goes back to sign-in with a message.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const client = await supabaseForRequest();
  let ok = false;
  if (code) ok = !(await client.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type && OTP_TYPES.includes(type)) ok = !(await client.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  if (!ok) return NextResponse.redirect(new URL("/sign-in?error=link", url.origin), 303);
  try {
    await supabaseAccountsDb(client).acceptMyInvites("");
  } catch {
    // Accepting invites is retried on the next sign-in; the link itself worked.
  }
  return NextResponse.redirect(new URL(next, url.origin), 303);
}
