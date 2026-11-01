import { NextResponse } from "next/server";
import { devMemoryEnabled } from "../../../lib/dev";
import { supabaseForRequest } from "../../../lib/supabase-server";

export const dynamic = "force-dynamic";

/** POST /auth/sign-out: ends this browser's session (other devices stay signed in) and goes to sign-in. */
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (!devMemoryEnabled()) {
    const client = await supabaseForRequest();
    await client.auth.signOut({ scope: "local" });
  }
  return NextResponse.redirect(new URL("/sign-in?signed_out=1", url.origin), 303);
}
