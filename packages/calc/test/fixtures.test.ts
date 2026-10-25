import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { collectFields } from "@rhoeflow/schema";
import { CalcFixtureSchema } from "../src/fixture.js";
import { prepareInput, runCalculation } from "../src/engine.js";
import { CalcOutputSchema } from "../src/contracts.js";
import { canonicalJson } from "../src/canonical.js";

const dir = resolve(import.meta.dirname, "../fixtures");
const files = readdirSync(dir).filter((f) => f.endsWith(".fixture.json"));

describe("committed fixtures", () => {
  it("there is at least one", () => {
    expect(files).toContain("ranch-1960s-dfw.fixture.json");
  });

  for (const file of files) {
    describe(file, () => {
      const raw: unknown = JSON.parse(readFileSync(resolve(dir, file), "utf8"));

      it("is a labeled fixture whose input the engine accepts (WO-01 definition of done)", () => {
        const fx = CalcFixtureSchema.parse(raw);
        expect(fx.label).toBe("fixture");
        const prepared = prepareInput(fx.input);
        expect(prepared.issues).toEqual([]);
        expect(prepared.ok).toBe(true);
      });

      it("every field has a state and a source, and none is unknown or proposed", () => {
        const fx = CalcFixtureSchema.parse(raw);
        const fields = collectFields(fx.input.assessment);
        expect(fields.length).toBeGreaterThan(100);
        for (const { path, field } of fields) {
          if (field.state === "unknown") throw new Error(`${path} is unknown (${field.reason}); fixtures must be fully accepted`);
          expect(field.state, path).not.toBe("proposed");
          expect(field.source.length, path).toBeGreaterThan(0);
        }
        // The template left its mark.
        expect(fields.some((f) => f.field.state === "defaulted" && f.field.source.startsWith("template:"))).toBe(true);
      });

      it("round-trips through the engine contracts", async () => {
        const fx = CalcFixtureSchema.parse(raw);
        const prepared = prepareInput(fx.input);
        if (!prepared.ok) throw new Error("fixture should prepare");
        const out = await runCalculation(prepared.input);
        expect(CalcOutputSchema.safeParse(JSON.parse(JSON.stringify(out))).success).toBe(true);
        expect(canonicalJson(out.frozen_input)).toBe(canonicalJson(prepared.input));
        expect(out.status).toBe("not_implemented");
        expect(out.results.building).toBeNull();
      });
    });
  }
});
