import { describe, expect, it } from "vitest";
import { JobStoreError, notImplemented } from "../src/errors.js";
import { assertWriteBackSource, isLocalMediaId } from "../src/jobstore.js";

describe("assertWriteBackSource (ADR-030)", () => {
  it("accepts a complete write-back source", () => {
    expect(() => assertWriteBackSource({ source: "rhoeflow", assessment_id: "a", run_id: "r" }, "saveReport")).not.toThrow();
  });

  it("rejects a missing or foreign source", () => {
    expect(() => assertWriteBackSource({ assessment_id: "a", run_id: "r" }, "saveReport")).toThrow(JobStoreError);
    try {
      assertWriteBackSource({ source: "workedge" as unknown as "rhoeflow", assessment_id: "a", run_id: "r" }, "addNote");
    } catch (e) {
      expect(e).toBeInstanceOf(JobStoreError);
      expect((e as JobStoreError).code).toBe("invalid_request");
      expect((e as JobStoreError).call).toBe("addNote");
    }
  });

  it("rejects a write without assessment_id or run_id", () => {
    expect(() => assertWriteBackSource({ source: "rhoeflow", assessment_id: "a" }, "upsertEquipment")).toThrow(/run_id/);
    expect(() => assertWriteBackSource({ source: "rhoeflow", run_id: "r" }, "upsertEquipment")).toThrow(/assessment_id/);
  });
});

describe("JobStoreError", () => {
  it("marks only rate_limited and unavailable as retryable", () => {
    expect(new JobStoreError("rate_limited", "x").retryable).toBe(true);
    expect(new JobStoreError("unavailable", "x").retryable).toBe(true);
    expect(new JobStoreError("not_found", "x").retryable).toBe(false);
    expect(notImplemented("GET /projects/{id}").retryable).toBe(false);
  });

  it("not_implemented names the WorkEdge call", () => {
    const e = notImplemented("GET /projects/{id}", "awaiting schema confirmation");
    expect(e.code).toBe("not_implemented");
    expect(e.call).toBe("GET /projects/{id}");
    expect(e.message).toContain("WO-01");
  });
});

describe("local media ids (ADR-031)", () => {
  it("recognises the local: prefix", () => {
    expect(isLocalMediaId("local:0f1e2d3c")).toBe(true);
    expect(isLocalMediaId("we_media_123")).toBe(false);
  });
});
