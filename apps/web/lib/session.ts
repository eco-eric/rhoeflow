import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isStoreError, StoreError } from "@rhoeflow/store";
import { requireContext, type RequestContext } from "./context";
import { devMemoryEnabled } from "./dev";
import { sessionState } from "./session-cookie";

/**
 * Sessions in server-rendered pages (ADR-039). A Server Component cannot write cookies, so if it
 * refreshed an expired session itself the new refresh token would be lost and Supabase would end the
 * session the next time the old one is used. Pages therefore look at the session cookie without
 * calling Supabase: no cookie goes to /sign-in, an expired one goes through /auth/refresh (a Route
 * Handler, which can write cookies) and back. Route Handlers refresh normally. This replaces the
 * usual Next.js middleware, which OpenNext on Cloudflare does not run for Next 16's Node proxy.
 */
export { authStorageKey, safeNext, sessionState, type SessionState } from "./session-cookie";

/**
 * For a server-rendered page at `path`: redirects to sign-in, to a refresh, or to the "no account
 * yet" page as needed, otherwise returns the request context.
 */
export async function requirePageContext(path: string): Promise<RequestContext> {
  if (!devMemoryEnabled()) {
    const url = process.env["SUPABASE_URL"];
    if (!url) throw new StoreError("unavailable", "the server is not configured for sign-in (SUPABASE_URL missing)");
    const jar = await cookies();
    const state = await sessionState((n) => jar.get(n)?.value, url);
    if (state === "none") redirect(`/sign-in?next=${encodeURIComponent(path)}`);
    if (state === "stale") redirect(`/auth/refresh?next=${encodeURIComponent(path)}`);
  }
  try {
    return await requireContext();
  } catch (e) {
    if (isStoreError(e) && e.details?.["reason"] === "no_session") redirect(`/sign-in?next=${encodeURIComponent(path)}`);
    if (isStoreError(e) && e.details?.["reason"] === "no_account") redirect("/no-account");
    throw e;
  }
}
