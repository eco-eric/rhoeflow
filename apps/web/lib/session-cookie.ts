import { combineChunks, stringFromBase64URL } from "@supabase/ssr";

/**
 * Reading the `@supabase/ssr` session cookie without calling Supabase (see lib/session.ts for why).
 * No Next.js imports, so it is unit-tested on its own.
 */
const BASE64_PREFIX = "base64-";
/** Refresh a little early so a page never starts with a token about to expire. */
const MARGIN_S = 60;

export function authStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

export type SessionState = "none" | "fresh" | "stale";

/** Reads the `@supabase/ssr` session cookie (possibly chunked, possibly base64) and checks its expiry. */
export async function sessionState(read: (name: string) => string | undefined, supabaseUrl: string, nowS = Math.floor(Date.now() / 1000)): Promise<SessionState> {
  const raw = await combineChunks(authStorageKey(supabaseUrl), (name) => read(name) ?? null);
  if (!raw) return "none";
  let text = raw;
  try {
    if (text.startsWith(BASE64_PREFIX)) text = stringFromBase64URL(text.slice(BASE64_PREFIX.length));
    const s = JSON.parse(text) as { expires_at?: unknown; refresh_token?: unknown };
    if (typeof s.refresh_token !== "string" || s.refresh_token === "") return "none";
    if (typeof s.expires_at !== "number") return "stale";
    return s.expires_at - MARGIN_S > nowS ? "fresh" : "stale";
  } catch {
    return "stale";
  }
}

/** Only same-site paths are followed after sign-in; anything else goes home. */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || /[\r\n]/.test(raw)) return fallback;
  return raw;
}

