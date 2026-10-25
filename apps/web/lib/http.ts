import { ZodError, type ZodType, type output as ZodOutput } from "zod";
import { StoreError, redactForLog } from "@rhoeflow/store";

/**
 * Route-handler plumbing (API-001 structured errors). Every handler returns JSON; every failure is
 * `{ error: { code, message, details? } }` with the status the error names. Unknown failures are
 * logged with secret-looking keys redacted (SEC-002) and returned as a bare 500.
 */
export type Params<K extends string> = { params: Promise<Record<K, string>> };

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof StoreError) {
    const status = typeof e.details?.["http"] === "number" ? (e.details["http"] as number) : e.status;
    const details = e.details ? Object.fromEntries(Object.entries(e.details).filter(([k]) => k !== "http")) : undefined;
    return json({ error: { code: e.code, message: e.message, ...(details && Object.keys(details).length > 0 ? { details } : {}) } }, status);
  }
  if (e instanceof ZodError) {
    return json({ error: { code: "invalid_request", message: "request body does not match the contract", details: { issues: e.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })) } } }, 400);
  }
  console.error("unhandled", redactForLog({ message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined }));
  return json({ error: { code: "internal", message: "internal error" } }, 500);
}

export async function parseBody<S extends ZodType>(req: Request, schema: S): Promise<ZodOutput<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new StoreError("invalid_request", "request body must be JSON");
  }
  return schema.parse(raw) as ZodOutput<S>;
}

/** Wrap a handler so thrown StoreError / ZodError become structured responses. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
