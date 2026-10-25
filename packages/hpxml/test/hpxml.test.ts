import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateAssessment, type Assessment } from "@rhoeflow/schema";
import { minimalAssessment } from "@rhoeflow/schema/testing";
import { HpxmlSerializationError, assessmentToHpxml, childElements, el, find, manualJShieldingClass, parseXml, readSoftwareDefaults, renderXml, text, textOf } from "../src/index.js";

const repo = resolve(import.meta.dirname, "../../..");
const DFW = { epwFile: "USA_TX_Dallas-Fort.Worth.Intl.AP.722590_TMY3.epw", stateCode: "TX" };
const fixtureAssessment = (name: string): Assessment => {
  const fx = JSON.parse(readFileSync(resolve(repo, `packages/calc/fixtures/${name}.fixture.json`), "utf8")) as { input: { assessment: unknown } };
  const r = validateAssessment(fx.input.assessment);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.assessment;
};

describe("xml writer and reader", () => {
  it("round-trips elements, attributes, text and entities", () => {
    const doc = el("A", { x: "it's & <b>" }, el("B", text("C", 1.5), text("D", "a < b & c")), el("E"), text("F", null));
    const xml = renderXml(doc);
    expect(xml).toContain("<A x='it&apos;s &amp; &lt;b&gt;'>");
    expect(xml).not.toContain("<F");
    const back = parseXml(xml);
    expect(back.attrs["x"]).toBe("it's & <b>");
    expect(textOf(find(back, "B/C"))).toBe("1.5");
    expect(textOf(find(back, "B/D"))).toBe("a < b & c");
    expect(childElements(back, "E")).toHaveLength(1);
  });

  it("reads double-quoted attributes, comments and the declaration; rejects malformed input", () => {
    const e = parseXml(`<?xml version="1.0"?>\n<!-- c --><R a="1"><S>t</S></R>`);
    expect(e.attrs["a"]).toBe("1");
    expect(() => parseXml("<R><S></R>")).toThrow(/mismatched/);
    expect(() => parseXml("<R>")).toThrow(/unclosed/);
  });
});

describe("assessmentToHpxml", () => {
  for (const name of ["ranch-1960s-dfw", "two-story-2010-dfw"]) {
    it(`${name}: output is byte-identical to the file the oracle validated and ran (claude/09-spikes/r01/runs/serialized-${name}/input.xml)`, () => {
      const xml = assessmentToHpxml(fixtureAssessment(name), DFW);
      const committed = readFileSync(resolve(repo, `claude/09-spikes/r01/runs/serialized-${name}/input.xml`), "utf8").replace(/\r\n/g, "\n");
      expect(xml).toBe(committed);
    });
  }

  it("writes the policy and design inputs explicitly so the oracle never chooses them (ADR-005, ADR-034)", () => {
    const doc = parseXml(assessmentToHpxml(fixtureAssessment("ranch-1960s-dfw"), DFW));
    const sc = find(doc, "Building/BuildingDetails/BuildingSummary/extension/HVACSizingControl")!;
    expect(textOf(find(sc, "HeatPumpSizingMethodology"))).toBe("ACCA");
    expect(textOf(find(sc, "ManualJInputs/HeatingDesignTemperature"))).toBe("25.88");
    expect(textOf(find(sc, "ManualJInputs/CoolingDesignTemperature"))).toBe("98.42");
    expect(textOf(find(sc, "ManualJInputs/InfiltrationShieldingClass"))).toBe("4");
    expect(doc.attrs["xmlns"]).toBe("http://hpxmlonline.com/2025/12");
    expect(doc.attrs["schemaVersion"]).toBe("5.0");
  });

  it("maps units the way HPXML spells them", () => {
    const xml = assessmentToHpxml(fixtureAssessment("ranch-1960s-dfw"), DFW);
    expect(xml).toContain("<UnitofMeasure>ACH</UnitofMeasure>");
    expect(xml).toContain("<Units>Percent</Units>"); // duct leakage fraction
    expect(xml).toContain("<Units>AFUE</Units>");
    expect(xml).toContain("<Units>SEER</Units>");
    const two = assessmentToHpxml(fixtureAssessment("two-story-2010-dfw"), DFW);
    expect(two).toContain("<Units>CFM25</Units>");
  });

  it("refuses unknown or proposed inputs and unsupported cases with a path", () => {
    const a = validateAssessment(minimalAssessment());
    if (!a.ok) throw new Error("invalid");
    const base = a.assessment;
    // minimalAssessment has no site_type: a required HPXML input
    expect(() => assessmentToHpxml(base, DFW)).toThrow(HpxmlSerializationError);
    try {
      assessmentToHpxml(base, DFW);
    } catch (e) {
      expect((e as HpxmlSerializationError).code).toBe("missing_input");
      expect((e as HpxmlSerializationError).path).toBe("building.site.site_type");
    }
    const proposed = structuredClone(fixtureAssessment("ranch-1960s-dfw"));
    proposed.building.enclosure.walls[0]!.area.state = "proposed";
    expect(() => assessmentToHpxml(proposed, DFW)).toThrow(/walls\[0\]\.area: is proposed/);
    const barrier = structuredClone(fixtureAssessment("ranch-1960s-dfw"));
    barrier.building.enclosure.roofs[0]!.radiant_barrier = { value: true, state: "documented", source: "photo", evidence: [] };
    expect(() => assessmentToHpxml(barrier, DFW)).toThrow(/radiant barriers/);
  });

  it("shielding class follows the oracle's rule", () => {
    expect(manualJShieldingClass("normal", "suburban")).toBe(4);
    expect(manualJShieldingClass("well-shielded", "urban")).toBe(5);
    expect(manualJShieldingClass("exposed", "rural")).toBe(2);
  });
});

describe("readSoftwareDefaults (C4)", () => {
  it("lists only derivations RhoeFlow also makes as load-affecting on the serialized ranch run", () => {
    const d = readSoftwareDefaults(readFileSync(resolve(repo, "claude/09-spikes/r01/runs/serialized-ranch-1960s-dfw/in.xml"), "utf8"));
    expect(d.length).toBeGreaterThan(100);
    expect(d.every((x) => x.state === "defaulted" && x.source === "openstudio-hpxml v1.12.0 default")).toBe(true);
    const load = d.filter((x) => x.affectsDesignLoad).map((x) => `${x.path.split("/").slice(-2).join("/")}=${x.value}`);
    expect(load).toEqual([
      "ManualJInputs/HumidityDifference=26.2", // RhoeFlow derives the same 26.2 from the station MCWB
      "AirInfiltrationMeasurement[infil-1]/InfiltrationHeight=8.0", // not used by the design-load infiltration method
      "Roof[roof-1]/RoofColor=medium dark", // RhoeFlow classifies 0.9 absorptance the same way
      "Wall[wall-n]/Color=medium",
      "Wall[wall-e]/Color=medium",
      "Wall[wall-s]/Color=medium",
      "Wall[wall-w]/Color=medium",
      "Ducts[duct-supply]/DuctBuriedInsulationLevel=not buried",
      "Ducts[duct-supply]/DuctEffectiveRValue=4.38", // RhoeFlow derives 4.38
      "Ducts[duct-supply]/DuctSurfaceArea=432.0", // RhoeFlow derives 432
      "Ducts[duct-return]/DuctBuriedInsulationLevel=not buried",
      "Ducts[duct-return]/DuctEffectiveRValue=5.0",
      "Ducts[duct-return]/DuctSurfaceArea=80.0",
      "ManualJInputs/BlowerFanHeatBtuh=0.0",
    ]);
  });
});
