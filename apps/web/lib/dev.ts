import { MemoryObjectStorage, MemoryStoreDb, type StoreContext, type StoreDeps } from "@rhoeflow/store";

/**
 * Development-only stand-ins so the field app can be built and usability-tested before WorkEdge
 * sign-in (A1) and reads (A2) exist. Enabled only when NODE_ENV is not "production" AND
 * RHOE_DEV_MEMORY_STORE=1; `next build` inlines NODE_ENV=production, so a deployed Worker can
 * never reach this path. Nothing here is persisted: a restart loses everything.
 */
export function devMemoryEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env["RHOE_DEV_MEMORY_STORE"] === "1";
}

/** Fixed development identity. The team matches the fixture JobStore's jobs. */
export const DEV_CONTEXT: StoreContext = { team_id: "we_team_dev", user_id: "we_user_dev", template_editor: true };

const g = globalThis as { __rhoeDevDeps?: StoreDeps };

/** One store per server process, shared by every route bundle (Next compiles each route separately). */
export function devDeps(): StoreDeps {
  return (g.__rhoeDevDeps ??= { db: new MemoryStoreDb(), artifacts: new MemoryObjectStorage("rhoe-runs") });
}
