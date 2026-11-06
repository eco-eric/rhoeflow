import { describe, expect, it, vi } from "vitest";
import { ESRI, IMAGERY, esriTiles, imageryMeta, mercator } from "../lib/imagery";
import { fetchEsriTile } from "../lib/imagery-server";

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
