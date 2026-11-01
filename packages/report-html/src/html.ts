/**
 * A small escaping HTML template (no DOM, no React). Interpolated values are escaped unless they
 * are `Html` from another `html` template; arrays are joined; null, undefined and false print
 * nothing. Every text in a report comes from a frozen run, its frozen input or WorkEdge, so all of
 * it is escaped (SEC-002).
 */
export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

function part(v: unknown): string {
  if (v instanceof Html) return v.value;
  if (v === null || v === undefined || v === false) return "";
  if (Array.isArray(v)) return v.map(part).join("");
  return escapeHtml(String(v));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1]!;
  return new Html(out);
}
