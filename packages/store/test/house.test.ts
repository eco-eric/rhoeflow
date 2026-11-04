import { describe, expect, it, vi } from "vitest";
import {
  countyReading,
  createJob,
  findOrCreateJobForWorkEdge,
  getJobSite,
  lookupHouse,
  mapFoundation,
  mergeHouseFacts,
  citeSources,
  situsKey,
  type CountyHomeRow,
  type HouseLookupSources,
  type HouseReading,
} from "../src/index.js";
import { ctxA, ctxB, makeDeps } from "./helpers.js";

const rc = (over: Partial<HouseReading> = {}): HouseReading => ({
  source: "rentcast",
  record_id: "rc-1",
  retrieved_at: "2026-11-04T12:00:00.000Z",
  roll_year: null,
  year_built: 1985,
  living_area_ft2: 2000,
  stories: 1,
  foundation: "slab",
  foundation_raw: "Slab",
  garage_spaces: 2,
  bedrooms: 3,
  heating: "Central",
  cooling: "Central",
  roof: "Composition Shingle",
  exterior: "Brick Veneer",
  pool: false,
  ...over,
});

const county = (over: Partial<CountyHomeRow> = {}): CountyHomeRow => ({
  county: "dallas",
  account_num: "00000123456000000",
  roll_year: 2026,
  situs_key: "1412 ELM ST|DALLAS",
  situs_address: "1412 ELM ST",
  city: "DALLAS",
  year_built: 1985,
  living_area_ft2: 2040,
  stories: 1,
  foundation_raw: null,
  garage_spaces: 2,
  bedrooms: null,
  pool: false,
  central_heat: true,
  central_air: true,
  ...over,
});

describe("situsKey", () => {
  it("matches the same address written two ways", () => {
    expect(situsKey("1412 North Elm Street", "Dallas")).toBe("1412 N ELM ST|DALLAS");
    expect(situsKey("1412 N. ELM ST", "DALLAS")).toBe("1412 N ELM ST|DALLAS");
  });
  it("drops a unit and refuses a line with no house number or no city", () => {
    expect(situsKey("200 Oak Lane Apt 4", "Plano")).toBe("200 OAK LN|PLANO");
    expect(situsKey("Elm Street", "Dallas")).toBeNull();
    expect(situsKey("1412 Elm St", null)).toBeNull();
  });
});

describe("mapFoundation", () => {
  it("maps slab and crawlspace wording and leaves the rest blank", () => {
    expect(mapFoundation("Slab / Mat / Raft")).toBe("slab");
    expect(mapFoundation("Crawl")).toBe("crawlspace");
    expect(mapFoundation("Pier")).toBe("crawlspace");
    expect(mapFoundation("Slab / Pier")).toBeNull();
    expect(mapFoundation("Concrete")).toBeNull();
    expect(mapFoundation(null)).toBeNull();
  });
});

describe("mergeHouseFacts", () => {
  it("agrees on equal values and on living areas within 5%", () => {
    const m = mergeHouseFacts([rc(), countyReading(county(), "2026-11-04T12:00:00.000Z")]);
    expect(m.year_built).toMatchObject({ status: "agree", value: 1985 });
    expect(m.living_area_ft2).toMatchObject({ status: "agree", value: 2000 });
    expect(m.bedrooms).toMatchObject({ status: "one_source", value: 3 });
  });
  it("fills a blank from the county", () => {
    const m = mergeHouseFacts([rc({ year_built: null }), countyReading(county(), "2026-11-04T12:00:00.000Z")]);
    expect(m.year_built).toMatchObject({ status: "one_source", value: 1985, readings: [{ source: "county:dallas", value: 1985 }] });
  });
  it("shows both values and uses none when they disagree", () => {
    const m = mergeHouseFacts([rc({ living_area_ft2: 2600 }), countyReading(county(), "2026-11-04T12:00:00.000Z")]);
    expect(m.living_area_ft2.status).toBe("disagree");
    expect(m.living_area_ft2.value).toBeNull();
    expect(m.living_area_ft2.readings.map((r) => r.value)).toEqual([2600, 2040]);
  });
  it("never flags shown-only facts as a disagreement", () => {
    const m = mergeHouseFacts([rc({ heating: "Forced Air Gas" }), countyReading(county(), "2026-11-04T12:00:00.000Z")]);
    expect(m.heating).toMatchObject({ status: "one_source", value: "Forced Air Gas" });
    expect(m.roof).toMatchObject({ status: "one_source", value: "Composition Shingle" });
    expect(m.foundation).toMatchObject({ status: "one_source", value: "slab" });
  });
  it("cites each source with its record and date", () => {
    const readings = [rc(), countyReading(county(), "2026-11-04T12:00:00.000Z")];
    expect(citeSources(readings, ["rentcast", "county:dallas"])).toBe(
      "RentCast (county assessor record) record rc-1, read Nov 4, 2026; Dallas Central Appraisal District account 00000123456000000, 2026 roll, read Nov 4, 2026",
    );
  });
});

describe("lookupHouse", () => {
  async function setup() {
    const deps = makeDeps();
    deps.db.seedCountyHomes([county()]);
    const job = await createJob(deps, ctxA(), { customer_name: "Pat Rivera", address_line1: "1412 Elm Street", city: "Dallas", state: "TX", postal_code: "75201" });
    return { deps, job };
  }

  it("stores RentCast and the county record, with RentCast's point", async () => {
    const { deps, job } = await setup();
    const sources: HouseLookupSources = {
      rentcast: vi.fn(async () => ({ status: "found" as const, reading: rc(), lat: 32.78, lon: -96.8 })),
      geocode: vi.fn(async () => ({ lat: 1, lon: 1 })),
    };
    const site = await lookupHouse(deps, ctxA(), job.job_id, sources);
    expect(sources.rentcast).toHaveBeenCalledWith("1412 Elm Street, Dallas, TX 75201");
    expect(sources.geocode).not.toHaveBeenCalled();
    expect(site).toMatchObject({ lookup_status: "found", lat: 32.78, lon: -96.8, location_source: "rentcast", lookup_note: null });
    expect(site.readings.map((r) => r.source)).toEqual(["rentcast", "county:dallas"]);
  });

  it("runs once per job unless the tech looks again", async () => {
    const { deps, job } = await setup();
    const rentcast = vi.fn(async () => ({ status: "not_found" as const }));
    await lookupHouse(deps, ctxA(), job.job_id, { rentcast, geocode: null });
    await lookupHouse(deps, ctxA(), job.job_id, { rentcast, geocode: null });
    expect(rentcast).toHaveBeenCalledTimes(1);
    await lookupHouse(deps, ctxA(), job.job_id, { rentcast, geocode: null }, { force: true });
    expect(rentcast).toHaveBeenCalledTimes(2);
  });

  it("uses the county record and the geocoder when RentCast fails", async () => {
    const { deps, job } = await setup();
    const site = await lookupHouse(deps, ctxA(), job.job_id, {
      rentcast: async () => ({ status: "error" as const, note: "RentCast didn't answer." }),
      geocode: async () => ({ lat: 32.7, lon: -96.7 }),
    });
    expect(site).toMatchObject({ lookup_status: "found", location_source: "ors", lookup_note: "RentCast didn't answer." });
    expect(site.readings.map((r) => r.source)).toEqual(["county:dallas"]);
  });

  it("says when nothing matched, when a source failed, and when no source is set", async () => {
    const deps = makeDeps();
    const job = await createJob(deps, ctxA(), { customer_name: "A", address_line1: "9 Nowhere Rd", city: "Plano", state: "TX" });
    expect(await lookupHouse(deps, ctxA(), job.job_id, { rentcast: async () => ({ status: "not_found" }), geocode: null })).toMatchObject({
      lookup_status: "not_found",
      lookup_note: "No property record matched this address.",
    });
    expect(await lookupHouse(deps, ctxA(), job.job_id, { rentcast: async () => ({ status: "error", note: "x" }), geocode: null }, { force: true })).toMatchObject({ lookup_status: "error" });
    expect(await lookupHouse(deps, ctxA(), job.job_id, { rentcast: null, geocode: null }, { force: true })).toMatchObject({ lookup_status: "off" });
  });

  it("does not use a county record when several share the address", async () => {
    const { deps, job } = await setup();
    deps.db.seedCountyHomes([county({ account_num: "second" })]);
    const site = await lookupHouse(deps, ctxA(), job.job_id, { rentcast: null, geocode: null });
    expect(site.readings).toEqual([]);
    expect(site.lookup_note).toContain("more than one record");
  });

  it("looks nothing up for a job with no street address", async () => {
    const deps = makeDeps();
    const { job } = await findOrCreateJobForWorkEdge(deps, ctxA(), { project_id: "we_project_9", property_id: null, name: "WorkEdge job with no address" });
    const rentcast = vi.fn();
    const site = await lookupHouse(deps, ctxA(), job.job_id, { rentcast, geocode: null });
    expect(rentcast).not.toHaveBeenCalled();
    expect(site).toMatchObject({ lookup_status: "not_found", readings: [] });
  });

  it("keeps each account's lookups to itself", async () => {
    const { deps, job } = await setup();
    await lookupHouse(deps, ctxA(), job.job_id, { rentcast: null, geocode: null });
    await expect(getJobSite(deps, ctxB(), job.job_id)).rejects.toMatchObject({ code: "not_found" });
    await expect(lookupHouse(deps, ctxB(), job.job_id, { rentcast: null, geocode: null })).rejects.toMatchObject({ code: "not_found" });
    expect(await getJobSite(deps, ctxA(), job.job_id)).not.toBeNull();
  });
});
