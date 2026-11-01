import type { AccountsDb } from "@rhoeflow/store";
import { supabaseAccountsDb } from "@rhoeflow/store/supabase";
import { devAccounts } from "./dev";

/**
 * Accounts, members, invites and profiles (ADR-039) as the signed-in user: the Supabase adapter
 * under row-level security, or the development account in the memory store.
 */
export function accountsDb(rc: { client: import("@supabase/supabase-js").SupabaseClient | null }): AccountsDb {
  return rc.client ? supabaseAccountsDb(rc.client) : devAccounts();
}
