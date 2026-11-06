import { describe, expect, it } from "vitest";
import { embedImage, fetchEmbeddedImage, renderReportHtml, reportBodyHtml } from "../src/index.js";
import { fakeSatellite, modelFor, STAND_IN_PNG } from "./helpers.js";

function imageFetch(res: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return res(url, init);
  }) as typeof fetch;
  return { f, calls };
}

const png = () => new Response(Buffer.from(STAND_IN_PNG), { headers: { "content-type": "image/png" } });
const PNG_DATA_URL = `data:image/png;base64,${Buffer.from(STAND_IN_PNG).toString("base64")}`;

describe("satellite view of the home (owner's request, 2026-11-06)", () => {
  it("embeds a JPEG or PNG of a plausible size, and nothing else", () => {
    expect(embedImage(STAND_IN_PNG, "image/png")).toBe(PNG_DATA_URL);
    expect(embedImage(STAND_IN_PNG, "IMAGE/JPEG; charset=binary")?.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(embedImage(STAND_IN_PNG, "text/html")).toBeNull();
    expect(embedImage(STAND_IN_PNG, "image/svg+xml")).toBeNull();
    expect(embedImage(new Uint8Array(200), "image/png")).toBeNull();
    expect(embedImage(new Uint8Array(2_000_001), "image/png")).toBeNull();
  });

  it("fetches one image over HTTPS with the headers given, and gives null rather than throwing", async () => {
    const ok = imageFetch(png);
    expect(await fetchEmbeddedImage("https://imagery.example/house.png", { fetch: ok.f, headers: { Referer: "https://app.example/" } })).toBe(PNG_DATA_URL);
    expect(ok.calls[0]!.url).toBe("https://imagery.example/house.png");
    expect(new Headers(ok.calls[0]!.init?.headers).get("referer")).toBe("https://app.example/");
    expect(await fetchEmbeddedImage("https://x.example/a", { fetch: imageFetch(() => new Response("nope", { status: 503 })).f })).toBeNull();
    expect(await fetchEmbeddedImage("https://x.example/a", { fetch: imageFetch(() => new Response("{}", { headers: { "content-type": "application/json" } })).f })).toBeNull();
    const thrown = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await fetchEmbeddedImage("https://x.example/a", { fetch: thrown })).toBeNull();
    const never = imageFetch(png);
    expect(await fetchEmbeddedImage("http://x.example/a", { fetch: never.f })).toBeNull();
    expect(never.calls).toHaveLength(0);
  });

  it("sits right under the address, with the credit and a dot in the middle, and keeps the document self-contained", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json", { property_label: { text: "1 Elm St, Dallas, TX 75238", source: "RhoeFlow job, read at render time" } });
    const s = fakeSatellite();
    const body = reportBodyHtml(model, { satellite: s });
    const address = body.indexOf('<p class="address">');
    const figure = body.indexOf('<figure class="satellite">');
    const firstRow = body.indexOf("<table", address);
    expect(address).toBeGreaterThan(0);
    expect(figure).toBeGreaterThan(address);
    expect(figure).toBeLessThan(firstRow);
    expect(body).toContain('viewBox="0 0 640 640"');
    expect(body).toContain('<circle cx="320" cy="320"');
    expect(body).toContain('x="-40" y="-25" width="360" height="360"');
    expect(body).toContain("Imagery: stand-in");
    const doc = renderReportHtml(model, { satellite: s });
    const hrefs = [...doc.matchAll(/\shref="([^"]{0,30})/g)].map((m) => m[1]!);
    expect(hrefs.length).toBe(s.images.length);
    for (const h of hrefs) expect(h.startsWith("data:image/png;base64,")).toBe(true);
    for (const banned of [/<script/i, /<link/i, /<img/i, /<iframe/i, /\ssrc=/i, /@import/i, /https?:\/\//i]) expect(doc).not.toMatch(banned);
  });

  it("draws nothing if any image is not an embedded picture or a number is off, so the document can't be made to fetch", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json");
    const bad = [
      (s: ReturnType<typeof fakeSatellite>) => (s.images[1]!.data_url = "https://example.com/x.png"),
      (s: ReturnType<typeof fakeSatellite>) => (s.images[2]!.data_url = 'data:image/png;base64,AAA" onload="alert(1)'),
      (s: ReturnType<typeof fakeSatellite>) => (s.images[0]!.left = Number.NaN),
      (s: ReturnType<typeof fakeSatellite>) => (s.size = 0),
      (s: ReturnType<typeof fakeSatellite>) => (s.images = []),
    ];
    for (const spoil of bad) {
      const s = fakeSatellite();
      spoil(s);
      const body = reportBodyHtml(model, { satellite: s });
      expect(body).not.toContain("example.com");
      expect(body).not.toContain("onload");
      expect(body).not.toContain("satellite");
    }
  });

  it("prints no figure when there is no picture", async () => {
    const { model } = await modelFor("qp-ranch-1964-slab.fixture.json");
    expect(reportBodyHtml(model, { satellite: null })).toBe(reportBodyHtml(model));
    expect(reportBodyHtml(model)).not.toContain("satellite");
  });
});
