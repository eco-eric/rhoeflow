export type JobStoreErrorCode =
  | "not_implemented"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "conflict"
  | "invalid_request"
  | "unavailable";

const RETRYABLE: ReadonlySet<JobStoreErrorCode> = new Set(["rate_limited", "unavailable"]);

/** Structured failure (API-001 "structured errors"). Callers branch on `code`, not on text. */
export class JobStoreError extends Error {
  readonly code: JobStoreErrorCode;
  readonly retryable: boolean;
  /** For `not_implemented`: the WorkEdge call that would have been made. */
  readonly call: string | undefined;

  constructor(code: JobStoreErrorCode, message: string, options: { call?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "JobStoreError";
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.call = options.call;
  }
}

export function notImplemented(call: string, detail?: string): JobStoreError {
  return new JobStoreError(
    "not_implemented",
    `${call} is not implemented in WO-01${detail ? `: ${detail}` : ""}`,
    { call },
  );
}
