import { StoreError } from "@rhoeflow/store";

/**
 * Server-side configuration. Secrets come from the Worker's environment (wrangler secrets or the
 * Cloudflare dashboard, ADR-036) and `.dev.vars` locally. Nothing here is `NEXT_PUBLIC_`, so no
 * secret reaches a client bundle (SEC-002). The anon key is a publishable key by design; the
 * service-role key is never read anywhere in this app (ADR-031).
 */
export interface ServerEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  runsBucket: string;
  mediaBucket: string;
}

export function serverEnv(): ServerEnv {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"];
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new StoreError("unavailable", "the server is not configured for persistence (SUPABASE_URL / SUPABASE_ANON_KEY missing)");
  }
  return {
    supabaseUrl,
    supabaseAnonKey,
    runsBucket: process.env["RHOE_RUNS_BUCKET"] ?? "rhoe-runs",
    mediaBucket: process.env["RHOE_MEDIA_BUCKET"] ?? "rhoe-media",
  };
}
