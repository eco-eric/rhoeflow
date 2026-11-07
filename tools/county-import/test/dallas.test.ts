import { describe, expect, it } from "vitest";
import { csvRows } from "../src/csv.js";
import { dallasCity, readDallas } from "../src/dallas.js";
import { collect, from } from "./helpers.js";

// Made-up accounts in DCAD's column layout. Owner columns exist in the real file and are never read.
const ACCOUNTS = `ACCOUNT_NUM,APPRAISAL_YR,DIVISION_CD,EXCLUDE_OWNER,STREET_NUM,STREET_HALF_NUM,FULL_STREET_NAME,BLDG_ID,UNIT_ID,PROPERTY_CITY,PROPERTY_ZIPCODE
"00000100000000000",2026,"RES","N","1412","","N ELM ST","","","DALLAS","752011234"
"00000200000000000",2026,"RES","Y","9","","SECRET LN","","","DALLAS","75201"
"00000300000000000",2026,"COM","N","500","","MAIN ST","","","DALLAS","75201"
"00000400000000000",2026,"RES","N","77","1/2","OAK DR","","4","GARLAND (DALLAS CO)","75040"
"00000500000000000",2026,"RES","N","3","","FARM RD","","","NO TOWN","75159"
"00000600000000000",2026,"RES","N","8","","LOT ST","","","DALLAS","75201"
`;
const DETAIL = `ACCOUNT_NUM,TAX_OBJ_ID,YR_BUILT,TOT_LIVING_AREA_SF,NUM_STORIES_DESC,FOUNDATION_TYP_DESC,HEATING_TYP_DESC,AC_TYP_DESC,EXT_WALL_DESC,ROOF_TYP_DESC,ROOF_MAT_DESC,NUM_BEDROOMS,POOL_IND
"00000100000000000","1",1985,2040,"ONE STORY","SLAB","CENTRAL FULL","CENTRAL FULL","BRICK VENEER","GABLE","COMPOSITION SHINGLE",3,"N"
"00000100000000000","2",1990,300,"ONE STORY","SLAB","NONE","NONE","FRAME","GABLE","COMPOSITION SHINGLE",0,"N"
"00000200000000000","1",2001,1800,"TWO STORIES","SLAB","CENTRAL FULL","CENTRAL FULL","BRICK VENEER","HIP","COMPOSITION SHINGLE",4,"N"
"00000400000000000","1",0,0,"UNASSIGNED","PIER AND BEAM","GAS HEATERS","WINDOW","UNASSIGNED","UNASSIGNED","UNASSIGNED",0,""
"00000500000000000","1",1950,1200,"ONE AND ONE HALF STORIES","POST","CENTRAL FULL","CENTRAL FULL","FRAME","GABLE","METAL",2,"Y"
`;
const ADDL = `ACCOUNT_NUM,TAX_OBJ_ID,IMPR_TYP_DESC,AREA_SIZE
"00000100000000000","1","ATTACHED GARAGE",440
"00000100000000000","2","DETACHED CARPORT",200
"00000100000000000","3","POOL",450
"00000500000000000","1","DETACHED GARAGE",0
`;

async function run(roll_year?: number) {
  const skipped: string[] = [];
  const rows = await collect(
    readDallas({ accounts: csvRows(from([ACCOUNTS])), detail: csvRows(from([DETAIL])), addl: csvRows(from([ADDL])) }, { ...(roll_year ? { roll_year } : {}), onSkip: (r) => skipped.push(r) }),
  );
  return { rows, skipped };
}

describe("readDallas", () => {
  it("keeps residential accounts with a building, and leaves out confidential owners and commercial", async () => {
    const { rows, skipped } = await run();
    expect(rows.map((r) => r.account_num)).toEqual(["00000100000000000", "00000400000000000", "00000500000000000"]);
    expect(skipped.sort()).toEqual(["confidential_owner", "no_building"]);
  });

  it("uses the largest building and the record's own wording", async () => {
    const { rows } = await run();
    expect(rows[0]).toEqual({
      county: "dallas",
      account_num: "00000100000000000",
      roll_year: 2026,
      situs_address: "1412 N ELM ST",
      city: "DALLAS",
      situs_zip: "75201",
      year_built: 1985,
      living_area_ft2: 2040,
      stories: 1,
      foundation_raw: "Slab",
      bedrooms: 3,
      pool: true,
      central_heat: true,
      central_air: true,
      heating_raw: "Central full",
      cooling_raw: "Central full",
      roof_raw: "Composition shingle, gable",
      exterior_raw: "Brick veneer",
      garage_raw: "Attached garage, 440 ft²",
    });
  });

  it("treats 0 and UNASSIGNED as unknown and keeps a unit and a half number", async () => {
    const { rows } = await run();
    expect(rows[1]).toMatchObject({
      situs_address: "77 1/2 OAK DR UNIT 4",
      city: "GARLAND",
      year_built: null,
      living_area_ft2: null,
      stories: null,
      bedrooms: null,
      pool: null,
      central_heat: false,
      central_air: false,
      heating_raw: "Gas heaters",
      cooling_raw: "Window",
      exterior_raw: null,
      roof_raw: null,
    });
    expect(rows[2]).toMatchObject({ city: null, stories: 1.5, foundation_raw: "Post", pool: true, garage_raw: "Detached garage" });
  });

  it("reads the city out of DCAD's wording", () => {
    expect(dallasCity("GARLAND (DALLAS CO)")).toBe("GARLAND");
    expect(dallasCity("NO TOWN")).toBeNull();
    expect(dallasCity("")).toBeNull();
  });
});
