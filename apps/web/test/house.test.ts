import { describe, expect, it, vi } from "vitest";
import type { JobSiteRow } from "@rhoeflow/store";
import { houseView, orsGeocodeSource, parseRentcastRecord, rentcastSource } from "../lib/house";
import { permitSearchFor } from "../lib/permits";
import { IMAGERY, bearingToCompass, compassLabel, headingFromOrientation, mercator, pointToward, satelliteImageUrl, snapToCompass } from "../lib/imagery";

const KEY = "test-key-not-real";
const record = {
  id: "1412-Elm-St,-Dallas,-TX-75201",
  latitude: 32.78,
  longitude: -96.8,
  bedrooms: 3,
  squareFootage: 2000,
  yearBuilt: 1985,
  features: { floorCount: 1, foundationType: "Slab / Mat / Raft", garageSpaces: 2, heatingType: "Forced Air", coolingType: "Central", roofType: "Composition Shingle", pool: false },
};
const reply = (status: number, body: unknown = null) => new Response(body === null ? "" : JSON.stringify(body), { status });

describe("RentCast (ADR-043)", () => {
  it("keeps only the fields RhoeFlow uses, with range checks", () => {
    const { reading, lat, lon } = parseRentcastRecord({ ...record, yearBuilt: 3000, features: { ...record.features, floorCount: "two" } }, "2026-11-04T12:00:00.000Z");
    expect(reading).toMatchObject({ source: "rentcast", year_built: null, living_area_ft2: 2000, stories: null, foundation: "slab", foundation_raw: "Slab / Mat / Raft", bedrooms: 3 });
    expect({ lat, lon }).toEqual({ lat: 32.78, lon: -96.8 });
    expect(parseRentcastRecord({ latitude: 32.7 }, "x")).toMatchObject({ lat: null, lon: null });
  });

  it("sends the key in a header, never in the address", async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) => reply(200, [record]));
    const r = await rentcastSource(KEY, { fetch: f as unknown as typeof fetch })("1412 Elm St, Dallas, TX 75201");
    expect(r.status).toBe("found");
    const [url, init] = f.mock.calls[0]!;
    expect(url).not.toContain(KEY);
    expect(new URL(url).searchParams.get("address")).toBe("1412 Elm St, Dallas, TX 75201");
    expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe(KEY);
  });

  it("names each failure without the key", async () => {
    const run = (status: number, body: unknown = null) => rentcastSource(KEY, { fetch: (async () => reply(status, body)) as unknown as typeof fetch })("a");
    expect(await run(404)).toEqual({ status: "not_found" });
    expect(await run(200, [])).toEqual({ status: "not_found" });
    const refused = await run(401);
    expect(refused).toMatchObject({ status: "error" });
    expect(JSON.stringify(refused)).not.toContain(KEY);
    expect(await run(429)).toMatchObject({ status: "error", note: expect.stringContaining("busy") });
    const thrown = await rentcastSource(KEY, { fetch: (async () => { throw new Error(KEY); }) as unknown as typeof fetch })("a");
    expect(JSON.stringify(thrown)).not.toContain(KEY);
  });
});

describe("ORS geocode", () => {
  it("reads the first point and gives null when there is none", async () => {
    const f = (body: unknown) => (async () => reply(200, body)) as unknown as typeof fetch;
    expect(await orsGeocodeSource(KEY, { fetch: f({ features: [{ geometry: { coordinates: [-96.8, 32.78] } }] }) })("a")).toEqual({ lat: 32.78, lon: -96.8 });
    expect(await orsGeocodeSource(KEY, { fetch: f({ features: [] }) })("a")).toBeNull();
  });
});

describe("permit search links", () => {
  it("knows DFW cities however they are written, and nothing else", () => {
    expect(permitSearchFor("FORT WORTH")).toMatchObject({ city: "Fort Worth", url: expect.stringMatching(/^https:\/\//) });
    expect(permitSearchFor("City of Dallas")?.city).toBe("Dallas");
    expect(permitSearchFor("Springfield")).toBeNull();
    expect(permitSearchFor(null)).toBeNull();
  });
});

describe("houseView", () => {
  const site = (readings: JobSiteRow["readings"]): JobSiteRow => ({
    job_id: "job_1",
    account_id: "acct-a",
    lat: 32.78,
    lon: -96.8,
    location_source: "rentcast",
    readings,
    lookup_status: "found",
    lookup_note: null,
    looked_up_at: "2026-11-04T12:00:00.000Z",
    updated_at: "2026-11-04T12:00:00.000Z",
  });
  const rc = parseRentcastRecord(record, "2026-11-04T12:00:00.000Z").reading;
  const county = { ...rc, source: "county:dallas" as const, record_id: "000001", roll_year: 2026, living_area_ft2: 2600, bedrooms: null, heating: null, cooling: null, roof: null, foundation: null, foundation_raw: null };

  it("is empty before the first lookup and still carries the permit link", () => {
    expect(houseView(null, "Plano")).toMatchObject({ status: null, rows: [], permit: { city: "Plano" } });
  });

  it("pre-fills agreed facts with their sources and leaves disagreements to the tech", () => {
    const v = houseView(site([rc, county]), "Dallas");
    const row = (k: string) => v.rows.find((r) => r.key === k)!;
    expect(row("year_built").answer).toMatchObject({ question: "year_built", value: 1985, source: expect.stringContaining("Dallas Central Appraisal District") });
    expect(row("stories").answer).toMatchObject({ question: "stories", value: 1 });
    expect(row("foundation").answer).toMatchObject({ question: "foundation", value: "slab", source: expect.stringContaining("RentCast") });
    expect(row("living_area_ft2")).toMatchObject({ status: "disagree", text: null, answer: null });
    expect(row("living_area_ft2").readings.map((r) => r.answer?.value)).toEqual([2000, 2600]);
    expect(row("roof").answer).toBeNull();
    expect(v.location).toEqual({ lat: 32.78, lon: -96.8, source: "rentcast" });
    expect(v.sources).toHaveLength(2);
  });

  it("leaves out a value the quick pass has no choice for", () => {
    const v = houseView(site([{ ...rc, bedrooms: 8, stories: 1.5 }]), null);
    expect(v.rows.find((r) => r.key === "bedrooms")?.answer).toBeNull();
    expect(v.rows.find((r) => r.key === "stories")?.answer).toBeNull();
    expect(v.permit).toBeNull();
  });
});

describe("satellite map", () => {
  it("asks the NAIP image server for a north-up square of real ground round the house", () => {
    const m = mercator(32.7767, -96.797);
    expect(m.x).toBeCloseTo(-10775392.8, 0); // EPSG:3857 for downtown Dallas
    expect(m.y).toBeCloseTo(3865702.0, 0);
    const u = new URL(satelliteImageUrl(32.7767, -96.797));
    expect(u.origin + u.pathname).toBe(IMAGERY.service);
    expect(u.searchParams.get("bboxSR")).toBe("3857");
    expect(u.searchParams.get("size")).toBe(`${IMAGERY.px},${IMAGERY.px}`);
    const [x0, y0, x1, y1] = u.searchParams.get("bbox")!.split(",").map(Number);
    // 60 m each side of the house, widened by 1 / cos(latitude) for Mercator: 71.4 units.
    expect(x1! - x0!).toBeCloseTo(142.7, 0);
    expect(y1! - y0!).toBeCloseTo(142.7, 0);
    expect((x0! + x1!) / 2).toBeCloseTo(m.x, 0);
  });

  it("snaps a tapped front to the eight directions", () => {
    const c = { x: 100, y: 100 };
    expect(bearingToCompass(c, { x: 100, y: 50 })).toBe(0);
    expect(bearingToCompass(c, { x: 150, y: 100 })).toBe(90);
    expect(bearingToCompass(c, { x: 100, y: 150 })).toBe(180);
    expect(bearingToCompass(c, { x: 60, y: 60 })).toBe(315);
    expect(bearingToCompass(c, { x: 99, y: 40 })).toBe(0);
    expect(snapToCompass(-20)).toBe(0);
    expect(snapToCompass(337.6)).toBe(0);
    expect(compassLabel(130)).toBe("SE");
  });

  it("draws the picked direction from the house, north up", () => {
    const c = { x: 320, y: 320 };
    const e = pointToward(c, 90, 100);
    expect(e.x).toBeCloseTo(420);
    expect(e.y).toBeCloseTo(320);
    const s = pointToward(c, 180, 100);
    expect(s.y).toBeCloseTo(420);
  });

  it("reads the phone compass on iPhone and Android, and nothing from a phone without one", () => {
    expect(headingFromOrientation({ alpha: 10, webkitCompassHeading: 135 })).toBe(135); // iOS
    expect(headingFromOrientation({ alpha: 90, absolute: true })).toBe(270); // Android: alpha turns the other way
    expect(headingFromOrientation({ alpha: 90, absolute: true }, 90)).toBe(0); // held sideways
    expect(headingFromOrientation({ alpha: 90, absolute: false })).toBeNull(); // relative only: no north
    expect(headingFromOrientation({ alpha: null })).toBeNull();
  });
});
