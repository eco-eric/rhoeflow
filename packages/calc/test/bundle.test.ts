import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { writeBundle } from "../src/bundle.js";
import { CalcFixtureSchema } from "../src/fixture.js";
import { prepareInput, runCalculation } from "../src/engine.js";

const dir = mkdtempSync(join(tmpdir(), "rhoe-bundle-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("artifact bundle (ENG-008, WO-02 C5)", () => {
  it("writes the frozen input, canonical input, output, HPXML and a hashed manifest", async () => {
    const fx = CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/ranch-1960s-dfw.fixture.json"), "utf8")));
    const p = prepareInput(fx.input);
    if (!p.ok) throw new Error("fixture should prepare");
    const out = await runCalculation(p.input, { run_id: "11111111-2222-4333-8444-555555555555", now: () => new Date("2026-10-25T12:00:00Z") });
    const m = writeBundle(dir, p.input, out);
    expect(m.files.map((f) => f.path)).toEqual(["building.xml", "frozen-input.canonical.json", "frozen-input.json", "output.json"]);
    expect(m.run_id).toBe("11111111-2222-4333-8444-555555555555");
    expect(m.status).toBe("ok");
    for (const f of m.files) {
      expect(createHash("sha256").update(readFileSync(join(dir, f.path))).digest("hex"), f.path).toBe(f.sha256);
    }
    const canonical = readFileSync(join(dir, "frozen-input.canonical.json"));
    expect(`sha256:${createHash("sha256").update(canonical).digest("hex")}`).toBe(out.manifest.input_hash);
    const committed = readFileSync(resolve(import.meta.dirname, "../../../claude/09-spikes/r01/runs/serialized-ranch-1960s-dfw/input.xml"), "utf8").replace(/\r\n/g, "\n");
    expect(readFileSync(join(dir, "building.xml"), "utf8")).toBe(committed);
  });
});
