/**
 * The one-time code from Supabase's sign-in email (ADR-039): digits only, 6 to 10 of them
 * (Supabase's code length setting). Spaces and dashes people type or paste are dropped.
 * Returns null when what is left cannot be a code.
 */
export function normalizeCode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  return /^\d{6,10}$/.test(digits) ? digits : null;
}
