import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resdbAch50, type ResdbInput } from "../../src/methods/infiltration-resdb.js";
import { EngineInputError } from "../../src/methods/errors.js";
import { tightnessClassInfiltration } from "../../src/methods/infiltration.js";

interface OracleCase {
  fixture: string;
  leakiness: ResdbInput["leakiness"];
  oracle_ach50: number;
  oracle_infiltration_method: string | null;
  oracle_infiltration_cfm: { heating: number; cooling: number } | null;
  input: ResdbInput;
}
const data = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../fixtures/oracle/resdb-ach50.json"), "utf8")) as { cases: OracleCase[] };

describe("RHOE.infiltration.resdb_ach50 vs oracle (WO-03 B8)", () => {
  it("has a case for every fixture at every leakiness level", () => {
    expect(data.cases.length).toBe(30);
    expect(new Set(data.cases.map((c) => c.leakiness)).size).toBe(5);
  });

  for (const c of data.cases) {
    it(`${c.fixture} ${c.leakiness}: ${c.oracle_ach50.toFixed(3)} ACH50`, () => {
      expect(Math.abs(resdbAch50(c.input) - c.oracle_ach50)).toBeLessThan(1e-9);
    });
  }

  // The same oracle runs default ManualJ InfiltrationMethod to the default infiltration table,
  // so they also check MJ8.infiltration.tightness_class (oracle airflows rounded to 1 cfm).
  for (const c of data.cases) {
    it(`MJ8.infiltration.tightness_class ${c.fixture} ${c.leakiness}: ${c.oracle_infiltration_cfm?.heating} / ${c.oracle_infiltration_cfm?.cooling} cfm`, () => {
      expect(c.oracle_infiltration_method).toBe("default infiltration table");
      const r = tightnessClassInfiltration({
        leakiness: c.leakiness,
        conditionedFloorAreaFt2: c.input.conditionedFloorAreaFt2,
        aboveGradeVolumeFt3: c.input.infiltrationVolumeFt3,
        storiesAboveGrade: c.input.storiesAboveGrade,
        facilityType: "single-family detached",
      });
      expect(Math.abs(r.heatingCfm - c.oracle_infiltration_cfm!.heating)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(r.coolingCfm - c.oracle_infiltration_cfm!.cooling)).toBeLessThanOrEqual(0.5);
    });
  }

  it("is monotonic in the leakiness answer", () => {
    const base = data.cases.find((c) => c.fixture === "ranch-1960s-dfw" && c.leakiness === "average")!.input;
    const levels = ["very tight", "tight", "average", "leaky", "very leaky"] as const;
    const v = levels.map((l) => resdbAch50({ ...base, leakiness: l }));
    for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThan(v[i - 1]!);
  });

  it("refuses inputs it has no coefficient for", () => {
    const base = data.cases[0]!.input;
    expect(() => resdbAch50({ ...base, ieccClimateZone: "9Z" })).toThrow(EngineInputError);
    expect(() => resdbAch50({ ...base, ductLocationFractions: { "attic - vented": 0.8, garage: 0.5 } })).toThrow(/sum to/);
    expect(() => resdbAch50({ ...base, conditionedFloorAreaFt2: 0 })).toThrow(EngineInputError);
  });
});
