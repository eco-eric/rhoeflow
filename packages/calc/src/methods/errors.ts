/**
 * Structured engine errors (ENG-007). The engine never guesses: a missing, unaccepted,
 * mis-united or unsupported input stops the method with a code the caller can branch on.
 */
export type EngineErrorCode =
  | "unaccepted_input" // field is proposed or unknown (ADR-003, ADR-027)
  | "missing_input"
  | "unit_mismatch"
  | "out_of_range"
  | "unsupported"; // a case the method's supported-case matrix excludes (OWN-004)

export class EngineInputError extends Error {
  readonly code: EngineErrorCode;
  readonly path: string | undefined;
  readonly method: string | undefined;

  constructor(code: EngineErrorCode, message: string, options: { path?: string | undefined; method?: string | undefined } = {}) {
    super(message);
    this.name = "EngineInputError";
    this.code = code;
    this.path = options.path;
    this.method = options.method;
  }
}
