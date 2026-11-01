import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { serverEnv } from "./env";

/**
 * The signed-in user's Supabase client for a request (RhoeFlow's own Supabase Auth, ADR-039). It
 * carries the session from cookies, so every database call runs under row-level security as that
 * user and their current account. There is no service-role client in this app (ADR-031).
 */
export async function supabaseForRequest(): Promise<SupabaseClient> {
  const env = serverEnv();
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // A Server Component render cannot set cookies; pages refresh through /auth/refresh first (lib/session.ts).
        }
      },
    },
  });
}
