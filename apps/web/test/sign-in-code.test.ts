import { describe, expect, it } from "vitest";
import { normalizeCode } from "../lib/sign-in-code";

describe("emailed sign-in code (ADR-039)", () => {
  it("keeps the digits people type or paste", () => {
    expect(normalizeCode("123456")).toBe("123456");
    expect(normalizeCode(" 123 456 ")).toBe("123456");
    expect(normalizeCode("123-456")).toBe("123456");
    expect(normalizeCode("12345678")).toBe("12345678");
  });
  it("refuses what cannot be a code", () => {
    expect(normalizeCode("")).toBeNull();
    expect(normalizeCode("12345")).toBeNull();
    expect(normalizeCode("12345678901")).toBeNull();
    expect(normalizeCode("12a456")).toBeNull();
  });
});
