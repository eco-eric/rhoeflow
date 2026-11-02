const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * A WorkEdge project id from what someone pasted: the id itself, or a WorkEdge link that has the
 * project's id in it. Null when neither is there.
 */
export function projectIdFrom(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const m = UUID.exec(text);
  if (m) return m[0].toLowerCase();
  // Development fixture ids and any other plain id with no spaces or slashes.
  return /^[A-Za-z0-9_-]{1,100}$/.test(text) ? text : null;
}
