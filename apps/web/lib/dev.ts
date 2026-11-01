import { MemoryAccountsDb, MemoryObjectStorage, MemoryStoreDb, type StoreContext, type StoreDeps } from "@rhoeflow/store";

/**
 * Development-only stand-ins so the field app and the account screens can be tried without a
 * Supabase project or a WorkEdge key. Enabled only when NODE_ENV is not "production" AND
 * RHOE_DEV_MEMORY_STORE=1; `next build` inlines NODE_ENV=production, so a deployed Worker can
 * never reach this path. Nothing here is persisted: a restart loses everything.
 */
export function devMemoryEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env["RHOE_DEV_MEMORY_STORE"] === "1";
}

/** Fixed development identity: the admin of one development account (ADR-039). */
export const DEV_CONTEXT: StoreContext = { account_id: "we_team_dev", user_id: "we_user_dev", role: "admin", template_editor: true };
export const DEV_EMAIL = "dev@rhoeflow.invalid";

const g = globalThis as { __rhoeDevDeps?: StoreDeps; __rhoeDevAccounts?: MemoryAccountsDb };

/** One store per server process, shared by every route bundle (Next compiles each route separately). */
export function devDeps(): StoreDeps {
  return (g.__rhoeDevDeps ??= { db: new MemoryStoreDb(), artifacts: new MemoryObjectStorage("rhoe-runs") });
}

/** The development account, with the development user as its admin. */
export function devAccounts(): MemoryAccountsDb {
  if (!g.__rhoeDevAccounts) {
    const db = new MemoryAccountsDb();
    db.addUser(DEV_CONTEXT.user_id!, DEV_EMAIL);
    db.addAccount(DEV_CONTEXT.account_id, "Development account");
    db.addMember(DEV_CONTEXT.account_id, DEV_CONTEXT.user_id!, "admin");
    g.__rhoeDevAccounts = db;
  }
  return g.__rhoeDevAccounts;
}
