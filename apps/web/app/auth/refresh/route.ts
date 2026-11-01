import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../lib/supabase-server";
import { safeNext } from "../../../lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /auth/refresh?next=/path: refreshes an expired session where cookies can be written (a Route
 * Handler), then goes back to the page. No usable session goes to sign-in. See lib/session.ts.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get("next"));
  const client = await supabaseForRequest();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return NextResponse.redirect(new URL(`/sign-in?next=${encodeURIComponent(next)}`, url.origin), 303);
  return NextResponse.redirect(new URL(next, url.origin), 303);
}
