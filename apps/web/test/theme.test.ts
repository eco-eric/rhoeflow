import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEME_KEY, THEME_SCRIPT, themeChoiceFrom } from "../lib/theme";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** Declarations of the first block that starts with `selector {`, as "name: value" lines. */
function block(selector: string): string[] {
  const at = css.indexOf(`${selector} {`);
  expect(at, `${selector} block`).toBeGreaterThanOrEqual(0);
  const body = css.slice(at + selector.length + 2, css.indexOf("}", at)).replace(/\/\*[\s\S]*?\*\//g, "");
  return body
    .split(";")
    .map((d) => d.trim())
    .filter((d) => d.startsWith("--") || d.startsWith("color-scheme"));
}

describe("themes (ADR-042)", () => {
  it("the device-dark and pinned-dark blocks set the same tokens", () => {
    const system = block(':root:not([data-theme="light"])');
    const pinned = block(':root[data-theme="dark"]');
    expect(system.length).toBeGreaterThan(30);
    expect(system).toEqual(pinned);
  });

  it("dark and light define every token", () => {
    const names = (lines: string[]) => lines.map((l) => l.split(":")[0]).sort();
    expect(names(block(':root[data-theme="dark"]'))).toEqual(names(block(":root")));
  });

  it("components use tokens: no raw colours after the token blocks except the print rule", () => {
    const rest = css.slice(css.indexOf("* { box-sizing"));
    const raw = rest.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
    expect(raw.filter((c) => c !== "#fff" && c !== "#000")).toEqual([]);
  });

  it("only light and dark are pinned; anything else is System", () => {
    expect(themeChoiceFrom("light")).toBe("light");
    expect(themeChoiceFrom("dark")).toBe("dark");
    expect(themeChoiceFrom("system")).toBe("system");
    expect(themeChoiceFrom("<script>")).toBe("system");
    expect(themeChoiceFrom(null)).toBe("system");
  });

  it("the head script reads the same key and sets only light or dark", () => {
    expect(THEME_SCRIPT).toContain(`localStorage.getItem("${THEME_KEY}")`);
    expect(THEME_SCRIPT).toContain('t==="light"||t==="dark"');
    expect(THEME_SCRIPT).not.toMatch(/innerHTML|eval|document\.write/);
  });
});
