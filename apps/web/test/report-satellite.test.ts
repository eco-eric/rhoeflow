import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ESRI, IMAGERY, esriTiles } from "../lib/imagery";
import { reportSatellite } from "../lib/report-satellite";

const KEY = "test-key-not-real";
const [LAT, LON] = [32.9478, -96.7295];

/** A JPEG-typed body big enough to pass as a picture (the report only checks type and size). */
const PICTURE = new Uint8Array(deflateSync(Buffer.alloc(4_000, 7), { level: 0 }));

function fakeFetch(answer: (url: string) => Response) {
  const urls: string[] = [];
  const headers: Headers[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(String(input));
    headers.push(new Headers(init?.headers));
    return answer(String(input));
  }) as typeof fetch;
  return { f, urls, headers };
}
const image = () => new Response(Buffer.from(PICTURE), { headers: { "content-type": "image/jpeg" } });
const isEsri = (u: string) => u.startsWith("https://ibasemaps-api.arcgis.com/");
const isNaip = (u: string) => u.startsWith(IMAGERY.service);

describe("the report's satellite picture is the job page's (ADR-044)", () => {
  it("uses the Esri tiles when the key is set and every tile comes back, placed as on the map", async () => {
    const { f, urls, headers } = fakeFetch(image);
    const s = await reportSatellite(LAT, LON, { fetch: f, key: KEY });
    const tiles = esriTiles(LAT, LON);
    expect(s).not.toBeNull();
    expect(s!.credit).toBe(ESRI.credit);
    expect(s!.size).toBe(IMAGERY.px);
    expect(s!.images.map(({ left, top, size }) => ({ left, top, size }))).toEqual(tiles.map(({ left, top, size }) => ({ left, top, size })));
    expect(s!.images.every((i) => i.data_url.startsWith("data:image/jpeg;base64,"))).toBe(true);
    expect(urls.every(isEsri)).toBe(true);
    // The key goes in Esri's header, never in the address that is fetched.
    expect(urls.some((u) => u.includes(KEY))).toBe(false);
    expect(headers.every((h) => h.get("x-esri-authorization") === `Bearer ${KEY}`)).toBe(true);
  });

  it("falls back to the NAIP image when one Esri tile fails", async () => {
    let n = 0;
    const { f, urls } = fakeFetch((u) => (isEsri(u) && n++ === 1 ? new Response('{"error":{"code":498}}', { headers: { "content-type": "application/json" } }) : image()));
    const s = await reportSatellite(LAT, LON, { fetch: f, key: KEY });
    expect(s!.credit).toBe(IMAGERY.credit);
    expect(s!.images).toEqual([{ data_url: expect.stringMatching(/^data:image\/jpeg;base64,/), left: 0, top: 0, size: IMAGERY.px }]);
    expect(urls.filter(isNaip)).toHaveLength(1);
  });

  it("goes straight to NAIP with no key, and gives no picture when NAIP fails too", async () => {
    const noKey = fakeFetch(image);
    const s = await reportSatellite(LAT, LON, { fetch: noKey.f, key: "" });
    expect(s!.credit).toBe(IMAGERY.credit);
    expect(noKey.urls.every(isNaip)).toBe(true);
    const down = fakeFetch(() => new Response("down", { status: 503 }));
    expect(await reportSatellite(LAT, LON, { fetch: down.f, key: KEY })).toBeNull();
    const none = fakeFetch(image);
    expect(await reportSatellite(Number.NaN, LON, { fetch: none.f, key: KEY })).toBeNull();
    expect(none.urls).toHaveLength(0);
  });
});
