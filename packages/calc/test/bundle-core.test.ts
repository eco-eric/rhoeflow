import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBundle } from "../src/bundle-core.js";
import { sha256Hex } from "../src/canonical.js";
import { CalcFixtureSchema } from "../src/fixture.js";
import { prepareInput, runCalculation } from "../src/engine.js";

describe("in-memory artifact bundle (ENG-008; WO-03 C3)", () => {
  it("builds the same files the CLI writes, with a manifest that hashes every one of them", async () => {
    const fx = CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/two-story-2010-dfw.fixture.json"), "utf8")));
    const p = prepareInput(fx.input);
    if (!p.ok) throw new Error("fixture should prepare");
    const out = await runCalculation(p.input, { run_id: "11111111-2222-4333-8444-555555555555", now: () => new Date("2026-10-25T12:00:00Z") });
    const b = await buildBundle(p.input, out);
    expect(b.files.map((f) => f.path)).toEqual(["frozen-input.json", "frozen-input.canonical.json", "output.json", "building.xml", "manifest.json"]);
    expect(b.manifest.files.map((f) => f.path)).toEqual(["building.xml", "frozen-input.canonical.json", "frozen-input.json", "output.json"]);
    for (const m of b.manifest.files) {
      const f = b.files.find((x) => x.path === m.path)!;
      expect(await sha256Hex(f.bytes), m.path).toBe(m.sha256);
      expect(f.bytes.byteLength).toBe(m.bytes);
    }
    const canonical = b.files.find((f) => f.path === "frozen-input.canonical.json")!;
    expect(`sha256:${await sha256Hex(canonical.bytes)}`).toBe(out.manifest.input_hash);
    expect(JSON.parse(new TextDecoder().decode(b.files.at(-1)!.bytes))).toEqual(b.manifest);
  });

  it("records why the house did not serialize instead of dropping the file silently", async () => {
    const fx = CalcFixtureSchema.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../fixtures/ranch-1960s-dfw.fixture.json"), "utf8")));
    const p = prepareInput(fx.input);
    if (!p.ok) throw new Error("fixture should prepare");
    const out = await runCalculation(p.input);
    const broken = { ...p.input, weather: { ...p.input.weather, station_key: "000000" } };
    const b = await buildBundle(broken, out);
    expect(b.files.map((f) => f.path)).toContain("hpxml-error.txt");
    expect(b.files.map((f) => f.path)).not.toContain("building.xml");
  });
});
