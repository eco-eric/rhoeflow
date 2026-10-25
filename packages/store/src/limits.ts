import { StoreError } from "./errors.js";

/**
 * Upload limits and sandboxing (WO-03 C6; SEC-002). Sizes and types are limits on what the app
 * stores, not statements about what WorkEdge accepts. Object paths are built only from checked
 * segments, never from caller-supplied paths; nothing here reaches a shell.
 */
export const UPLOAD_LIMITS = {
  photo: { max_bytes: 25 * 1024 * 1024, content_types: ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"] as readonly string[] },
  video: { max_bytes: 250 * 1024 * 1024, content_types: ["video/mp4", "video/quicktime", "video/webm"] as readonly string[] },
  report: { max_bytes: 50 * 1024 * 1024, content_types: ["application/pdf"] as readonly string[] },
  file_name_max: 180,
} as const;

export type UploadKind = keyof Omit<typeof UPLOAD_LIMITS, "file_name_max">;

export interface UploadCheck {
  kind: UploadKind;
  content_type: string;
  byte_length: number;
  file_name: string;
}

/** Returns the problems; empty when the upload may proceed. */
export function checkUpload(u: UploadCheck): string[] {
  const issues: string[] = [];
  const limit = UPLOAD_LIMITS[u.kind];
  if (!limit) issues.push(`unknown upload kind "${String(u.kind)}"`);
  else {
    if (!limit.content_types.includes(u.content_type.toLowerCase())) issues.push(`content type ${u.content_type} is not allowed for a ${u.kind} (allowed: ${limit.content_types.join(", ")})`);
    if (u.byte_length <= 0) issues.push("content is empty");
    if (u.byte_length > limit.max_bytes) issues.push(`${u.byte_length} bytes exceeds the ${u.kind} limit of ${limit.max_bytes} bytes`);
  }
  if (u.file_name.length === 0 || u.file_name.length > UPLOAD_LIMITS.file_name_max) issues.push(`file name must be 1 to ${UPLOAD_LIMITS.file_name_max} characters`);
  if (/[\\/\0]|^\.|\.\./.test(u.file_name)) issues.push("file name must not contain path separators, NUL, leading dots or '..'");
  return issues;
}

export function assertUpload(u: UploadCheck): void {
  const issues = checkUpload(u);
  if (issues.length > 0) throw new StoreError("invalid_request", "upload refused", { issues });
}

/**
 * One path segment for object storage: letters, digits, `.`, `_`, `-`; no leading dot; no `..`.
 * Anything else is refused rather than escaped, so a WorkEdge id that does not fit is a bug to
 * surface, not a path to guess at.
 */
export function safePathSegment(s: string): string {
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(s) || s.includes("..")) throw new StoreError("invalid_request", `"${s}" is not a safe path segment`);
  return s;
}

const SECRET_KEY = /(key|token|secret|password|passwd|authorization|cookie|jwt|signed_url)/i;

/** Copy of `value` with secret-looking keys replaced, for log lines (SEC-002 "no secrets in logs"). */
export function redactForLog<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactForLog) as unknown as T;
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEY.test(k) ? "[redacted]" : redactForLog(v);
    return out as T;
  }
  if (typeof value === "string" && /^(eyJ[A-Za-z0-9_-]+\.|sb[pa]_|Bearer )/.test(value)) return "[redacted]" as unknown as T;
  return value;
}
