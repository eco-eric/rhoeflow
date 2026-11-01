import { createChunks, stringToBase64URL } from "@supabase/ssr";
import { describe, expect, it } from "vitest";
import { authStorageKey, safeNext, sessionState } from "../lib/session-cookie";

const URL_ = "https://twelymqeeurtdzlxrjcb.supabase.co";
const KEY = "sb-twelymqeeurtdzlxrjcb-auth-token";
const NOW = 1_800_000_000;

function jar(session: unknown, opts: { base64?: boolean; chunk?: boolean } = {}): (n: string) => string | undefined {
  let value = JSON.stringify(session);
  if (opts.base64 !== false) value = `base64-${stringToBase64URL(value)}`;
  const chunks = opts.chunk ? createChunks(KEY, value, 200) : [{ name: KEY, value }];
  const m = new Map(chunks.map((c) => [c.name, c.value]));
  return (n) => m.get(n);
}

describe("session cookie (ADR-039)", () => {
  it("names the cookie after the project ref", () => {
    expect(authStorageKey(URL_)).toBe(KEY);
  });

  it("no cookie, or one without a refresh token, is no session", async () => {
    expect(await sessionState(() => undefined, URL_, NOW)).toBe("none");
    expect(await sessionState(jar({ access_token: "a", expires_at: NOW + 3600 }), URL_, NOW)).toBe("none");
  });

  it("an unexpired session is fresh, base64 or plain, chunked or not", async () => {
    const s = { access_token: "a".repeat(900), refresh_token: "r", expires_at: NOW + 3600 };
    expect(await sessionState(jar(s), URL_, NOW)).toBe("fresh");
    expect(await sessionState(jar(s, { base64: false }), URL_, NOW)).toBe("fresh");
    expect(await sessionState(jar(s, { chunk: true }), URL_, NOW)).toBe("fresh");
  });

  it("expired, about to expire, or unreadable goes through a refresh", async () => {
    expect(await sessionState(jar({ refresh_token: "r", expires_at: NOW - 1 }), URL_, NOW)).toBe("stale");
    expect(await sessionState(jar({ refresh_token: "r", expires_at: NOW + 30 }), URL_, NOW)).toBe("stale");
    expect(await sessionState(jar({ refresh_token: "r" }), URL_, NOW)).toBe("stale");
    expect(await sessionState((n) => (n === KEY ? "base64-%%%" : undefined), URL_, NOW)).toBe("stale");
  });

  it("only same-site paths are followed after sign-in", () => {
    expect(safeNext("/p/abc?x=1")).toBe("/p/abc?x=1");
    expect(safeNext(null)).toBe("/");
    expect(safeNext("https://evil.example/")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/ok\r\nSet-Cookie: x")).toBe("/");
    expect(safeNext("relative")).toBe("/");
  });
});
