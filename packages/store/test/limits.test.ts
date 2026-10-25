import { describe, expect, it } from "vitest";
import { assertUpload, checkUpload, redactForLog, safePathSegment } from "../src/index.js";

describe("upload limits and sandboxing (C6; SEC-002)", () => {
  it("accepts a normal photo and refuses type, size, empty and path-shaped names", () => {
    expect(checkUpload({ kind: "photo", content_type: "image/jpeg", byte_length: 2_000_000, file_name: "IMG_0001.jpg" })).toEqual([]);
    expect(checkUpload({ kind: "photo", content_type: "application/x-msdownload", byte_length: 10, file_name: "a.exe" })[0]).toMatch(/not allowed/);
    expect(checkUpload({ kind: "photo", content_type: "image/jpeg", byte_length: 26 * 1024 * 1024, file_name: "big.jpg" }).join()).toMatch(/exceeds/);
    expect(checkUpload({ kind: "photo", content_type: "image/jpeg", byte_length: 0, file_name: "x.jpg" }).join()).toMatch(/empty/);
    expect(checkUpload({ kind: "photo", content_type: "image/jpeg", byte_length: 1, file_name: "../etc/passwd" }).join()).toMatch(/path separators/);
    expect(checkUpload({ kind: "photo", content_type: "image/jpeg", byte_length: 1, file_name: ".hidden.jpg" }).join()).toMatch(/leading dots/);
    expect(checkUpload({ kind: "report", content_type: "application/pdf", byte_length: 1000, file_name: "report.pdf" })).toEqual([]);
    expect(() => assertUpload({ kind: "video", content_type: "video/mp4", byte_length: 300 * 1024 * 1024, file_name: "v.mp4" })).toThrow(/upload refused/);
  });

  it("path segments are checked, never escaped", () => {
    expect(safePathSegment("we_team_1")).toBe("we_team_1");
    expect(safePathSegment("0f1e2d3c-4b5a-4968-8777-66554433aa11")).toBeTruthy();
    for (const bad of ["..", "a/b", "a\\b", ".dot", "", "a b", "x".repeat(129), "$(rm -rf)"]) expect(() => safePathSegment(bad), bad).toThrow(/not a safe path segment/);
  });

  it("redacts secret-looking keys and token-shaped strings before logging", () => {
    const out = redactForLog({ supabase_anon_key: "sbp_123", nested: { Authorization: "Bearer abc", fine: "ok", url: "https://x" }, list: ["eyJhbGciOi.payload.sig", "plain"] });
    expect(out).toEqual({ supabase_anon_key: "[redacted]", nested: { Authorization: "[redacted]", fine: "ok", url: "https://x" }, list: ["[redacted]", "plain"] });
  });
});
