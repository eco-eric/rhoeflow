export type StoreErrorCode =
  | "not_found"
  | "conflict"
  | "precondition_failed"
  | "forbidden"
  | "invalid_request"
  | "stale"
  | "unavailable";

const HTTP: Record<StoreErrorCode, number> = {
  not_found: 404,
  conflict: 409,
  precondition_failed: 412,
  forbidden: 403,
  invalid_request: 400,
  stale: 409,
  unavailable: 503,
};

/**
 * Structured failure for the persistence API (API-001 "structured errors"). Callers branch
 * on `code`; the HTTP layer maps it to a status. `details` is safe to return to a signed-in
 * caller: it never carries secrets or another team's data.
 */
export class StoreError extends Error {
  readonly code: StoreErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: StoreErrorCode, message: string, details?: Record<string, unknown>, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "StoreError";
    this.code = code;
    this.status = HTTP[code];
    this.details = details;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) } };
  }
}
