/**
 * Minimal XML writer and reader for HPXML. Enough for well-formed, machine-written documents
 * (OpenStudio-HPXML's in.xml and our own output): elements, attributes in single or double
 * quotes, text, comments, the XML declaration and the five predefined entities. No DTDs,
 * CDATA, processing instructions beyond the declaration, or namespaced attribute handling.
 * Kept in-house so the serializer adds no dependency (CLAUDE.md: ask before adding one).
 */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}
export type XmlNode = XmlElement | string;

/** Build an element. Children that are null or undefined are dropped, so optional elements read naturally. */
export function el(name: string, attrsOrChildren?: Record<string, string> | XmlNode | null | undefined | (XmlNode | null | undefined)[], ...rest: (XmlNode | null | undefined | (XmlNode | null | undefined)[])[]): XmlElement {
  let attrs: Record<string, string> = {};
  const raw: unknown[] = [];
  if (attrsOrChildren && typeof attrsOrChildren === "object" && !Array.isArray(attrsOrChildren) && !("name" in attrsOrChildren && "children" in attrsOrChildren)) {
    attrs = attrsOrChildren as Record<string, string>;
  } else {
    raw.push(attrsOrChildren);
  }
  raw.push(...rest);
  const children: XmlNode[] = [];
  const add = (c: unknown) => {
    if (c === null || c === undefined) return;
    if (Array.isArray(c)) c.forEach(add);
    else children.push(c as XmlNode);
  };
  raw.forEach(add);
  return { name, attrs, children };
}

/** Element whose only child is text, or null when the value is null/undefined. */
export function text(name: string, value: string | number | boolean | null | undefined): XmlElement | null {
  if (value === null || value === undefined) return null;
  return { name, attrs: {}, children: [formatValue(value)] };
}

export function formatValue(value: string | number | boolean): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`cannot write non-finite number ${value}`);
    // Plain decimal notation; HPXML numbers never need exponents at these magnitudes.
    const s = String(value);
    return s.includes("e") ? value.toFixed(10).replace(/0+$/, "").replace(/\.$/, ".0") : s;
  }
  return String(value);
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" };
function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ESC[c]!);
}
function escapeAttr(s: string): string {
  return s.replace(/[&<>']/g, (c) => ESC[c]!);
}

export function renderXml(root: XmlElement, declaration = true): string {
  const lines: string[] = [];
  if (declaration) lines.push("<?xml version='1.0' encoding='UTF-8'?>");
  const walk = (e: XmlElement, depth: number) => {
    const pad = "  ".repeat(depth);
    const attrs = Object.entries(e.attrs)
      .map(([k, v]) => ` ${k}='${escapeAttr(v)}'`)
      .join("");
    if (e.children.length === 0) {
      lines.push(`${pad}<${e.name}${attrs}/>`);
    } else if (e.children.length === 1 && typeof e.children[0] === "string") {
      lines.push(`${pad}<${e.name}${attrs}>${escapeText(e.children[0])}</${e.name}>`);
    } else {
      lines.push(`${pad}<${e.name}${attrs}>`);
      for (const c of e.children) {
        if (typeof c === "string") lines.push(`${pad}  ${escapeText(c)}`);
        else walk(c, depth + 1);
      }
      lines.push(`${pad}</${e.name}>`);
    }
  };
  walk(root, 0);
  return lines.join("\n") + "\n";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", apos: "'", quot: '"' };
function unescape(s: string): string {
  return s.replace(/&(amp|lt|gt|apos|quot|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) => {
    if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#")) return String.fromCodePoint(parseInt(e.slice(1), 10));
    return ENTITIES[e]!;
  });
}

/** Parse a well-formed document into its root element. Whitespace-only text is dropped. */
export function parseXml(xml: string): XmlElement {
  let i = 0;
  const n = xml.length;
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  const fail = (msg: string): never => {
    throw new Error(`XML parse error at offset ${i}: ${msg}`);
  };
  while (i < n) {
    if (xml.startsWith("<?", i)) {
      const end = xml.indexOf("?>", i);
      if (end < 0) fail("unterminated declaration");
      i = end + 2;
    } else if (xml.startsWith("<!--", i)) {
      const end = xml.indexOf("-->", i);
      if (end < 0) fail("unterminated comment");
      i = end + 3;
    } else if (xml.startsWith("</", i)) {
      const end = xml.indexOf(">", i);
      if (end < 0) fail("unterminated end tag");
      const name = xml.slice(i + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) fail(`mismatched end tag </${name}>`);
      i = end + 1;
    } else if (xml[i] === "<") {
      i++;
      const nameMatch = /^[A-Za-z_][\w.:-]*/.exec(xml.slice(i, i + 200));
      if (!nameMatch) fail("bad element name");
      const name = nameMatch![0];
      i += name.length;
      const attrs: Record<string, string> = {};
      for (;;) {
        while (/\s/.test(xml[i] ?? "")) i++;
        if (xml.startsWith("/>", i) || xml[i] === ">") break;
        const am = /^([A-Za-z_][\w.:-]*)\s*=\s*(['"])/.exec(xml.slice(i, i + 300));
        if (!am) fail(`bad attribute in <${name}>`);
        i += am![0].length;
        const quote = am![2]!;
        const end = xml.indexOf(quote, i);
        if (end < 0) fail("unterminated attribute");
        attrs[am![1]!] = unescape(xml.slice(i, end));
        i = end + 1;
      }
      const e: XmlElement = { name, attrs, children: [] };
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(e);
      else if (root) fail("multiple root elements");
      else root = e;
      if (xml.startsWith("/>", i)) {
        i += 2;
      } else {
        i += 1;
        stack.push(e);
      }
    } else {
      const end = xml.indexOf("<", i);
      const raw = xml.slice(i, end < 0 ? n : end);
      if (raw.trim().length > 0) {
        const parent = stack[stack.length - 1];
        if (!parent) fail("text outside the root element");
        parent!.children.push(unescape(raw.trim()));
      }
      i = end < 0 ? n : end;
    }
  }
  if (stack.length > 0) fail(`unclosed <${stack[stack.length - 1]!.name}>`);
  if (!root) fail("empty document");
  return root!;
}

/** Child elements with a given name. */
export function childElements(e: XmlElement, name?: string): XmlElement[] {
  return e.children.filter((c): c is XmlElement => typeof c !== "string" && (name === undefined || c.name === name));
}

/** Text content of a text-only element, or undefined. */
export function textOf(e: XmlElement | undefined): string | undefined {
  if (!e) return undefined;
  const t = e.children.find((c): c is string => typeof c === "string");
  return t;
}

/** Follow a slash path of element names from e; returns the first match. */
export function find(e: XmlElement, path: string): XmlElement | undefined {
  let cur: XmlElement | undefined = e;
  for (const part of path.split("/")) {
    if (!cur) return undefined;
    cur = childElements(cur, part)[0];
  }
  return cur;
}
