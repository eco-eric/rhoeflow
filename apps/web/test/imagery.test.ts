import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ZOOM_STEP, ESRI, IMAGERY, ZOOM_STEPS, esriTiles, esriZoomFor, imageryMeta, mapToOffset, mercator, nearestZoomStep, offsetToMap, scaleBar, toMap } from "../lib/imagery";
import { CHECK_TILE, esriRefusal, esriStatus, fetchEsriTile } from "../lib/imagery-server";

const KEY = "test-key-not-real";

describe("Esri tiles for the satellite map (ADR-044)", () => {
  it("cover the same ground square as the NAIP picture, placed in the map's square", () => {
    const tiles = esriTiles(32.9478, -96.7295);
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(9);
    expect(tiles.every((t) => t.z === ESRI.zoom)).toBe(true);
    // Together they reach past every edge of the 0..px square, with no gap.
    expect(Math.min(...tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.min(...tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.left + t.size))).toBeGreaterThanOrEqual(IMAGERY.px);
    expect(Math.max(...tiles.map((t) => t.top + t.size))).toBeGreaterThanOrEqual(IMAGERY.px);
    // 120 m of ground across at zoom 19 is about 480 world pixels at DFW's latitude.
    const across = (IMAGERY.px / tiles[0]!.size) * 256;
    expect(across).toBeGreaterThan(450);
    expect(across).toBeLessThan(510);
  });

  it("puts the house in the middle, the same point the NAIP picture centres on", () => {
    const [lat, lon] = [32.7767, -96.797];
    const tiles = esriTiles(lat, lon);
    const t = tiles[0]!;
    const k = t.size / 256;
    const world = 256 * 2 ** t.z;
    const m = mercator(lat, lon);
    const cx = ((m.x + Math.PI * 6378137) / (2 * Math.PI * 6378137)) * world;
    expect((cx - t.x * 256) * k + t.left).toBeCloseTo(IMAGERY.px / 2, 3);
  });

  it("names Esri, with Powered by Esri, when Esri is in use", () => {
    expect(imageryMeta("esri").credit).toMatch(/^Powered by Esri/);
    expect(imageryMeta("naip").source).toBe(IMAGERY.source);
  });
});

describe("fetchEsriTile", () => {
  const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } });

  it("sends the key in Esri's header and the allowed site as Referer, never in the address", async () => {
    const f = vi.fn(async () => jpeg());
    const r = await fetchEsriTile(19, 121173, 211570, { fetch: f as never, key: KEY });
    expect(r.ok).toBe(true);
    const [url, init] = f.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(ESRI.tile(19, 121173, 211570));
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["X-Esri-Authorization"]).toBe(`Bearer ${KEY}`);
    expect((init.headers as Record<string, string>)["Referer"]).toBe("https://app.rhoeflow.pro/");
  });

  it("is off without a key, and refuses tiles out of range without calling Esri", async () => {
    const f = vi.fn(async () => jpeg());
    expect(await fetchEsriTile(19, 1, 1, { fetch: f as never, key: "" })).toMatchObject({ ok: false, status: 404 });
    expect(await fetchEsriTile(22, 1, 1, { fetch: f as never, key: KEY })).toMatchObject({ ok: false, status: 400 });
    expect(await fetchEsriTile(19, -1, 1, { fetch: f as never, key: KEY })).toMatchObject({ ok: false, status: 400 });
    expect(await fetchEsriTile(19, 2 ** 19, 1, { fetch: f as never, key: KEY })).toMatchObject({ ok: false, status: 400 });
    expect(f).not.toHaveBeenCalled();
  });

  it("treats Esri's JSON refusal (sent with HTTP 200) as a failure, so the map falls back to NAIP", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { code: 498, message: "Invalid token" } }), { headers: { "content-type": "application/json" } }));
    expect(await fetchEsriTile(19, 1, 1, { fetch: f as never, key: KEY })).toMatchObject({ ok: false, status: 502 });
    const g = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await fetchEsriTile(19, 1, 1, { fetch: g as never, key: KEY })).toMatchObject({ ok: false, status: 504 });
  });
});

describe("fetchEsriTile: Esri's reasons and the token fallback (ADR-045)", () => {
  const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "content-type": "image/jpeg" } });
  const refusal = (code: number, message: string, status = 200) => new Response(JSON.stringify({ error: { code, message, details: [] } }), { status, headers: { "content-type": "application/json" } });

  it("passes on Esri's own reason, so the map can say why it shows USGS", async () => {
    const f = vi.fn(async () => refusal(403, "User does not have permissions to access 'World_Imagery'."));
    const r = await fetchEsriTile(19, 1, 1, { fetch: f as never, key: KEY });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(!r.ok && r.reason).toContain("code 403");
    expect(!r.ok && r.reason).toContain("does not have permissions");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("asks once more with the key as Esri's token parameter when Esri didn't read the header (499)", async () => {
    const f = vi.fn().mockResolvedValueOnce(refusal(499, "Token Required")).mockResolvedValueOnce(jpeg());
    const r = await fetchEsriTile(19, 5, 6, { fetch: f as never, key: KEY });
    expect(r.ok).toBe(true);
    const [url2, init2] = f.mock.calls[1]! as unknown as [string, RequestInit];
    expect(url2).toBe(`${ESRI.tile(19, 5, 6)}?token=${KEY}`);
    expect((init2.headers as Record<string, string>)["X-Esri-Authorization"]).toBeUndefined();
    expect((init2.headers as Record<string, string>)["Referer"]).toBe(ESRI.referer);
  });

  it("never echoes the key in a reason, even when Esri's message repeats it", () => {
    const r = esriRefusal(JSON.stringify({ error: { code: 498, message: `Invalid token ${KEY}` } }), KEY);
    expect(r.code).toBe(498);
    expect(r.text).not.toContain(KEY);
    expect(esriRefusal("<html>", KEY)).toEqual({ code: null, text: "no reason given" });
  });

  it("reports the key missing, or Esri's reason, for the status check", async () => {
    expect(await esriStatus({ key: "" })).toEqual({ key: false, ok: false, reason: "ARCGIS_API_KEY is not set on the server" });
    const ok = vi.fn(async () => jpeg());
    expect(await esriStatus({ key: KEY, fetch: ok as never })).toEqual({ key: true, ok: true, reason: null });
    expect((ok.mock.calls[0] as unknown as [string])[0]).toBe(ESRI.tile(CHECK_TILE.z, CHECK_TILE.x, CHECK_TILE.y));
    const bad = vi.fn(async () => refusal(498, "Invalid token."));
    const s = await esriStatus({ key: KEY, fetch: bad as never });
    expect(s.ok).toBe(false);
    expect(s.reason).toContain("Invalid token");
  });
});

describe("zoom on the satellite map (ADR-045)", () => {
  const c = { lat: 32.875659, lon: -96.694949 };

  it("starts at the first map's 60 m view and snaps a pinch to the nearest step", () => {
    expect(ZOOM_STEPS[DEFAULT_ZOOM_STEP]).toBe(IMAGERY.halfMeters);
    expect(nearestZoomStep(60)).toBe(DEFAULT_ZOOM_STEP);
    expect(nearestZoomStep(30)).toBe(0);
    expect(nearestZoomStep(1000)).toBe(ZOOM_STEPS.length - 1);
    expect(nearestZoomStep(5)).toBe(0);
  });

  it("asks Esri for tiles whose detail matches the view, within what Esri serves", () => {
    expect(esriZoomFor(c.lat, 60)).toBe(19);
    expect(esriZoomFor(c.lat, 25)).toBe(19);
    expect(esriZoomFor(c.lat, 220)).toBe(18);
    for (const h of ZOOM_STEPS) {
      const tiles = esriTiles(c.lat, c.lon, h, IMAGERY.px, esriZoomFor(c.lat, h));
      expect(tiles.length).toBeLessThanOrEqual(25);
      expect(Math.max(...tiles.map((t) => t.left + t.size))).toBeGreaterThanOrEqual(IMAGERY.px);
    }
  });

  it("places a point the same way the imagery is placed, so streets line up at every zoom", () => {
    expect(toMap(c, 60, c)).toEqual({ x: 320, y: 320 });
    // 30 m north of the house is a quarter of the way up at 60 m each side, an eighth at 120 m.
    const north = { lat: c.lat + 30 / 111_320, lon: c.lon };
    expect(toMap(c, 60, north).y).toBeCloseTo(320 - 160, 0);
    expect(toMap(c, 120, north).y).toBeCloseTo(320 - 80, 0);
    const east = { lat: c.lat, lon: c.lon + 30 / (111_320 * Math.cos((c.lat * Math.PI) / 180)) };
    expect(toMap(c, 60, east).x).toBeCloseTo(320 + 160, 0);
  });

  it("keeps a point the tech placed on the same ground when the map zooms", () => {
    const o = mapToOffset(c.lat, 60, { x: 400, y: 250 });
    expect(offsetToMap(c.lat, 60, o).x).toBeCloseTo(400, 6);
    const zoomedOut = offsetToMap(c.lat, 120, o);
    expect(zoomedOut.x).toBeCloseTo(360, 6);
    expect(zoomedOut.y).toBeCloseTo(285, 6);
  });

  it("gives a round scale bar in feet that fits the corner", () => {
    for (const h of ZOOM_STEPS) {
      const b = scaleBar(h);
      expect(b.units).toBeLessThanOrEqual(150);
      expect(b.units).toBeGreaterThan(40);
      expect([5, 10, 20, 25, 50, 100, 200, 250, 500]).toContain(b.feet);
    }
  });
});
