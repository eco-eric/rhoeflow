import { describe, expect, it } from "vitest";
import { readTarrant, spaced, tarrantCity } from "../src/tarrant.js";
import { collect, fixed, from } from "./helpers.js";

// Made-up properties in TAD's True Prodigy fixed-width layout (TP Legacy 8.0.33).
const detail = (pid: string, imprv: string, type: string, yr: string, area: string) =>
  fixed(120, [[1, pid.padStart(12)], [17, imprv.padStart(12)], [41, type], [86, yr], [94, area.padStart(15)]]);
const attr = (pid: string, desc: string, cd: string) => fixed(87, [[1, pid.padStart(12)], [53, desc], [78, cd]]);
const info = (o: { pid: string; type?: string; year?: string; sup?: string; prefix?: string; street: string; suffix: string; city: string; zip: string; account: string; num: string; unit?: string }) =>
  fixed(4480, [
    [1, o.pid.padStart(12)],
    [13, o.type ?? "R"],
    [18, o.year ?? "2026"],
    [23, (o.sup ?? "0").padStart(12)],
    [1040, o.prefix ?? ""],
    [1050, o.street],
    [1100, o.suffix],
    [1110, o.city],
    [1140, o.zip],
    [4435, o.account],
    [4460, o.num],
    [4475, o.unit ?? ""],
  ]);

const DETAIL = [
  detail("1", "10", "ResMain", "1978", "1500"),
  detail("1", "10", "ResMain", "1995", "300"),
  detail("1", "10", "ResG", "1978", "420"),
  detail("1", "11", "ResSW", "2005", "400"),
  detail("2", "20", "ResMain", "2015", "2600"),
  detail("2", "21", "ResDG", "2015", "600"),
  detail("3", "30", "Garage", "2000", "500"), // no house: not kept
];
const ATTR = [
  attr("1", "CentralHeatAir", "CentralHea"),
  attr("1", "CentralHeatAir", "CentralAir"),
  attr("1", "Foundation", "ConcSlab"),
  attr("1", "ExtCover", "Masonry"),
  attr("1", "RoofMaterial", "CompShingl"),
  attr("2", "ExtCover", "MultiMat"),
];
const INFO = [
  info({ pid: "1", sup: "0", street: "OAK CREEK", suffix: "TC", city: "HALTOM CITY", zip: "76117", account: "00000051", num: "4500" }),
  info({ pid: "1", sup: "2", street: "OAK CREEK", suffix: "TC", city: "HALTOM CITY", zip: "761171234", account: "00000051", num: "4500" }),
  info({ pid: "2", prefix: "W", street: "MAIN", suffix: "ST", city: "TARANT COUNTY", zip: "76126", account: "", num: "12", unit: "B" }),
  info({ pid: "3", street: "LOT", suffix: "RD", city: "FORT WORTH", zip: "76101", account: "00000099", num: "1" }),
  info({ pid: "4", type: "P", street: "BIZ", suffix: "ST", city: "FORT WORTH", zip: "76101", account: "00000100", num: "1" }),
];

describe("readTarrant", () => {
  it("joins the detail, features and address, taking the latest supplement", async () => {
    const rows = await collect(readTarrant({ detail: from(DETAIL), attr: from(ATTR), info: from(INFO) }));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      county: "tarrant",
      account_num: "00000051",
      roll_year: 2026,
      situs_address: "4500 OAK CREEK TRACE",
      city: "HALTOM CITY",
      situs_zip: "76117",
      year_built: 1978,
      living_area_ft2: 1800,
      stories: null,
      foundation_raw: "Concrete slab",
      bedrooms: null,
      pool: true,
      central_heat: true,
      central_air: true,
      heating_raw: null,
      cooling_raw: null,
      roof_raw: "Comp shingl",
      exterior_raw: "Masonry",
      garage_raw: "Attached garage, 420 ft²",
    });
    // No legacy account number: the property id stands in. "TARANT COUNTY" is outside any city.
    expect(rows[1]).toMatchObject({ account_num: "2", situs_address: "12 W MAIN ST UNIT B", city: null, pool: null, central_heat: null, exterior_raw: "Mixed materials", garage_raw: "Detached garage, 600 ft²" });
  });

  it("reads TAD's city and code wording", () => {
    expect(tarrantCity("TARRANT COUNTY")).toBeNull();
    expect(tarrantCity("FORT WORTH ")).toBe("FORT WORTH");
    expect(spaced("CompShingl")).toBe("Comp shingl");
    expect(spaced("")).toBeNull();
  });
});
