import { describe, expect, it } from "vitest";
import { COLUMNS, csvHeader, csvLine, intIn, joinWording, Stats, toRow, wording, zipOf, type CountyFacts } from "../src/row.js";

const facts = (over: Partial<CountyFacts> = {}): CountyFacts => ({
  county: "dallas",
  account_num: "00000123456000000",
  roll_year: 2026,
  situs_address: "1412 N ELM STREET",
  city: "DALLAS",
  situs_zip: "75201",
  year_built: 1985,
  living_area_ft2: 2040,
  stories: 1,
  foundation_raw: "Slab",
  bedrooms: 3,
  pool: false,
  central_heat: true,
  central_air: true,
  heating_raw: "Central full",
  cooling_raw: "Central full",
  roof_raw: "Composition shingle, gable",
  exterior_raw: "Brick veneer",
  garage_raw: 'Attached garage, 440 ft² "big"',
  ...over,
});

describe("field helpers", () => {
  it("treats 0, blank and out-of-range numbers as unknown", () => {
    expect(intIn("1985", 1700, 2100)).toBe(1985);
    expect(intIn("0", 1700, 2100)).toBeNull();
    expect(intIn("", 1700, 2100)).toBeNull();
    expect(intIn("12a", 0, 50)).toBeNull();
    expect(intIn("2040.00", 100, 100000)).toBe(2040);
  });
  it("keeps five-digit ZIPs from 5 or 9 digits", () => {
    expect(zipOf("752431234")).toBe("75243");
    expect(zipOf("75243-1234")).toBe("75243");
    expect(zipOf("7524")).toBeNull();
  });
  it("turns the record's capitals into a sentence and drops UNASSIGNED", () => {
    expect(wording("CENTRAL  FULL")).toBe("Central full");
    expect(wording("UNASSIGNED")).toBeNull();
    expect(joinWording(["Composition shingle", null, "Gable"])).toBe("Composition shingle, gable");
    expect(joinWording([null])).toBeNull();
  });
});

describe("toRow", () => {
  it("keys the address the same way the lookup does and leaves the car count blank", () => {
    const r = toRow(facts());
    expect("row" in r && r.row).toMatchObject({ situs_key: "1412 N ELM ST|DALLAS", garage_spaces: null, situs_zip: "75201" });
  });
  it("keys a house outside any city as unincorporated", () => {
    const r = toRow(facts({ city: null }));
    expect("row" in r && r.row.situs_key).toBe("1412 N ELM ST|UNINCORPORATED");
  });
  it("skips a record with no house number or a value the table refuses", () => {
    expect(toRow(facts({ situs_address: "ELM ST" }))).toEqual({ skip: "no_address" });
    expect(toRow(facts({ account_num: "" }))).toEqual({ skip: "bad_record" });
  });
});

describe("CSV for COPY", () => {
  it("writes NULL as an empty unquoted field and quotes every text value", () => {
    const r = toRow(facts({ bedrooms: null, pool: null }));
    if (!("row" in r)) throw new Error("expected a row");
    expect(csvHeader().trim().split(",")).toEqual([...COLUMNS]);
    const line = csvLine(r.row);
    expect(line).toContain('"Attached garage, 440 ft² ""big"""');
    const cells = line.trim().split(",");
    expect(cells[COLUMNS.indexOf("bedrooms")]).toBe("");
    expect(cells[COLUMNS.indexOf("central_heat")]).toBe("t");
  });
});

describe("Stats", () => {
  it("counts rows, fills and shared addresses without keeping any address", () => {
    const s = new Stats();
    for (const a of ["1", "2"]) {
      const r = toRow(facts({ account_num: a }));
      if ("row" in r) s.add(r.row);
    }
    s.skip("no_building");
    const j = s.toJSON();
    expect(j).toMatchObject({ rows: 2, roll_years: [2026], skipped: { no_building: 1 }, rows_sharing_an_address: 2 });
    expect(JSON.stringify(j)).not.toContain("ELM");
  });
});
