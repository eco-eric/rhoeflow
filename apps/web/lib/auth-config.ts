/**
 * What the browser needs to talk to Supabase Auth directly (ADR-039): the project URL and the anon
 * key, which is publishable by design. Passed to the sign-in forms as props, so nothing is
 * `NEXT_PUBLIC_` and no secret reaches a browser (SEC-002). Null when the server has no Supabase
 * configured (the development memory store).
 */
export interface PublicAuthConfig {
  url: string;
  anonKey: string;
}

export function publicAuthConfig(): PublicAuthConfig | null {
  const url = process.env["SUPABASE_URL"];
  const anonKey = process.env["SUPABASE_ANON_KEY"];
  return url && anonKey ? { url, anonKey } : null;
}
