import { z } from "zod";
import { IsoTimestampSchema, WorkEdgeIdSchema } from "@rhoeflow/schema";
import { AccountDesignDefaultsSchema, emptyDesignDefaults, type AccountDesignDefaults, type DesignDefaultsContext } from "@rhoeflow/templates";
import { nowIso, type StoreContext, type StoreDeps } from "./context.js";
import { StoreError } from "./errors.js";

/**
 * Each account's design defaults (ADR-047, amends ADR-034): indoor set points and, per weather
 * station, outdoor winter and summer design temperatures. Members read them; admins change them.
 * A load calc copies the values it used into its accepted revision with their source, so a later
 * change never rewrites a frozen run; it only makes earlier runs out of date when re-accepted.
 */

/** rhoe.account_design_settings: one row per account, the defaults as one validated document. */
export const AccountDesignRowSchema = z.strictObject({
  account_id: WorkEdgeIdSchema,
  defaults: AccountDesignDefaultsSchema,
  updated_at: IsoTimestampSchema,
  updated_by: z.string().nullable(),
});
export type AccountDesignRow = z.output<typeof AccountDesignRowSchema>;

export interface AccountDesignView {
  defaults: AccountDesignDefaults;
  /** Null when the account has never saved any: everything is the standard value. */
  updated_at: string | null;
  /** Whether the caller may change them (the database enforces the same). */
  can_edit: boolean;
}

export async function getDesignDefaults(deps: StoreDeps, ctx: StoreContext): Promise<AccountDesignView> {
  const row = await deps.db.designSettings.get(ctx.account_id);
  return { defaults: row?.defaults ?? emptyDesignDefaults(), updated_at: row?.updated_at ?? null, can_edit: ctx.role === "admin" };
}

/** What the quick pass needs to build a load calc with the account's defaults (null: no defaults saved). */
export async function designContext(deps: StoreDeps, ctx: StoreContext, account_name: string): Promise<DesignDefaultsContext | null> {
  const row = await deps.db.designSettings.get(ctx.account_id);
  return row ? { account_name, updated_at: row.updated_at, defaults: row.defaults } : null;
}

/** Admins replace the whole document; a value left out goes back to the standard value. */
export async function saveDesignDefaults(deps: StoreDeps, ctx: StoreContext, raw: unknown): Promise<AccountDesignView> {
  if (!ctx.user_id) throw new StoreError("forbidden", "sign in first", { reason: "no_session", http: 401 });
  if (ctx.role !== "admin") throw new StoreError("forbidden", "only this account's admins can change its design conditions", { reason: "not_admin" });
  const parsed = AccountDesignDefaultsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StoreError("invalid_request", parsed.error.issues[0]?.message ?? "those design conditions are not valid", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    });
  }
  // Drop empty station entries so "cleared" reads the same as "never set".
  const stations = Object.fromEntries(Object.entries(parsed.data.stations).filter(([, s]) => s.heating_design_temp_f !== undefined || s.cooling_design_temp_f !== undefined));
  const row = await deps.db.designSettings.upsert({ account_id: ctx.account_id, defaults: { ...parsed.data, stations }, updated_at: nowIso(deps), updated_by: ctx.user_id });
  return { defaults: row.defaults, updated_at: row.updated_at, can_edit: true };
}
