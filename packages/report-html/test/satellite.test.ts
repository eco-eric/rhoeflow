import { describe, expect, it } from "vitest";
import { NAIP, REPORT_SATELLITE_HALF_METERS, fetchReportSatellite, naipSource, renderReportHtml, reportBodyHtml } from "../src/index.js";
import { fakeSatellite, modelFor, STAND_IN_PNG } from "./helpers.js";

function imageFetch(res: (url: string) => Response) {
  const urls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    return res(url);
  }) as typeof fetch;
  return { f, urls };
}

const LAT = 32.8879;
const LON = -96.7086;
const png = () => new Response(Buffer.from(STAND_IN_PNG), { headers: { "content-type": "image/png" } });

describe("satellite view of the home (owner's request, 2026-11-06)", () => {
  it("asks NAIP for one north-up square centred on the point, wide enough for the lot", () => {
    const s = naipSource(LAT, LON)!;
    const u = new URL(s.url);
    expect(`${u.origin}${u.pathname}`).toBe(NAIP.service);
    expect(u.searchParams.get("f")).toBe("image");
    expect(u.searchParams.get("bboxSR")).toBe("3857");
    expect(u.searchParams.get("size")).toBe("640,640");
    const [x0, y0, x1, y1] = u.searchParams.get("bbox")!.split(",").map(Number) as [number, number, number, number];
    // Square in map units, and the ground it covers is the asked width once Mercator's stretch is taken off.
    expect(x1 - x0).toBeCloseTo(y1 - y0, 0);
    expect(((x1 - x0) / 2) * Math.cos((LAT * Math.PI) / 180)).toBeCloseTo(REPORT_SATELLITE_HALF_METERS, 0);
    // The centre is the point.
    const lon = ((((x0 + x1) / 2) / 6378137) * 180) / Math.PI;
    const lat = ((2 * Math.atan(Math.exp((y0 + y1) / 2 / 6378137)) - Math.PI / 2) * 180) / Math.PI;
    expect(lon).toBeCloseTo(LON, 5);
    expect(lat).toBeCloseTo(LAT, 5);
    expect(s.credit).toBe(NAIP.credit);
    expect(naipSource(Number.NaN, LON)).toBeNull();
    expect(naipSource(LAT, 200)).toBeNull();
  });

  it("fetches the picture from the source it is given and embeds it", async () => {
    const { f, urls } = imageFetch(png);
    const s = await fetchReportSatellite({ url: "https://imagery.example/house.png", credit: "Imagery: someone" }, { fetch: f });
    expect(urls).toEqual(["https://imagery.example/house.png"]);
    expect(s).toEqual({ data_url: `data:image/png;base64,${Buffer.from(STAND_IN_PNG).toString("base64")}`, credit: "Imagery: someone" });
  });

  it("gives no picture when the image fails, isn't an image, is a blank, or there is no source", async () => {
    const src = naipSource(LAT, LON);
    expect(await fetchReportSatellite(src, { fetch: imageFetch(() => new Response("nope", { status: 503 })).f })).toBeNull();
    expect(await fetchReportSatellite(src, { fetch: imageFetch(() => new Response("<html></html>", { headers: { "content-type": "text/html" } })).f })).toBeNull();
    expect(await fetchReportSatellite(src, { fetch: imageFetch(() => new Response(new Uint8Array(200), { headers: { "content-type": "image/png" } })).f })).toBeNull();
    const thrown = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await fetchReportSatellite(src, { fetch: thrown })).toBeNull();
    expect(await fetchReportSatellite(null, { fetch: imageFetch(png).f })).toBeNull();
    expect(await fetchReportSatellite({ url: "http://imagery.example/x.png", credit: "x" }, { fetch: imageFetch(png).f })).toBeNull();
  });

  it("sits right under the address, with the credit, and keeps the document self-contained", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json", { property_label: { text: "1 Elm St, Dallas, TX 75238", source: "RhoeFlow job, read at render time" } });
    const body = reportBodyHtml(model, { satellite: fakeSatellite() });
    const address = body.indexOf('<p class="address">');
    const figure = body.indexOf('<figure class="satellite">');
    const firstRow = body.indexOf("<table", address);
    expect(address).toBeGreaterThan(0);
    expect(figure).toBeGreaterThan(address);
    expect(figure).toBeLessThan(firstRow);
    expect(body).toContain(NAIP.credit);
    const doc = renderReportHtml(model, { satellite: fakeSatellite() });
    const hrefs = [...doc.matchAll(/\shref="([^"]{0,30})/g)].map((m) => m[1]!);
    expect(hrefs.length).toBe(1);
    for (const h of hrefs) expect(h.startsWith("data:image/png;base64,")).toBe(true);
    for (const banned of [/<script/i, /<link/i, /<img/i, /<iframe/i, /\ssrc=/i, /@import/i, /https?:\/\//i]) expect(doc).not.toMatch(banned);
  });

  it("drops a picture that is not an embedded image, so the document can't be made to fetch", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json");
    for (const data_url of ["https://example.com/x.png", 'data:image/png;base64,AAA" onload="alert(1)']) {
      const body = reportBodyHtml(model, { satellite: { data_url, credit: "x" } });
      expect(body).not.toContain("example.com");
      expect(body).not.toContain("onload");
      expect(body).not.toContain("<image ");
    }
  });

  it("prints no figure when there is no picture", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json");
    expect(reportBodyHtml(model, { satellite: null })).toBe(reportBodyHtml(model));
    expect(reportBodyHtml(model)).not.toContain("satellite");
  });
});
