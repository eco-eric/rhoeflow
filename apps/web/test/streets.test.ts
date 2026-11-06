import { describe, expect, it, vi } from "vitest";
import { KEEP_CLEAR, STREETS, distToSegment, fetchStreets, labelEnds, labelSpot, placeLabels, segmentGap, mergeStreets, parseStreets, streetsQueryUrl } from "../lib/streets";

// A slice of TIGERweb's real answer round a Dallas test address (Census TIGER, public domain).
const local = {
  geometryType: "esriGeometryPolyline",
  features: [
    { attributes: { NAME: "Middle Knoll Dr", MTFCC: "S1400" }, geometry: { paths: [[[-96.697911, 32.875847], [-96.6974, 32.875949], [-96.694652, 32.875853], [-96.694133, 32.875847]]] } },
    { attributes: { NAME: "Villa Haven Dr", MTFCC: "S1400" }, geometry: { paths: [[[-96.698088, 32.875208], [-96.694869, 32.875069], [-96.693847, 32.875022]]] } },
    { attributes: { NAME: "Middle Knoll Dr", MTFCC: "S1400" }, geometry: { paths: [[[-96.694133, 32.875847], [-96.6935, 32.8758]]] } },
    { attributes: { NAME: null }, geometry: { paths: [[[-96.69, 32.87], ["x", 1], [-96.691, 32.871]]] } },
    { attributes: { NAME: "Broken" }, geometry: { rings: [] } },
  ],
};

describe("streets from TIGERweb (ADR-045)", () => {
  it("asks one layer for the roads in a square round the house, in lat/lon", () => {
    const u = new URL(streetsQueryUrl(8, 32.875659, -96.694949));
    expect(u.origin + u.pathname).toBe(`${STREETS.service}/8/query`);
    const [xmin, ymin, xmax, ymax] = u.searchParams.get("geometry")!.split(",").map(Number);
    expect(xmin).toBeLessThan(-96.694949);
    expect(xmax).toBeGreaterThan(-96.694949);
    expect((ymax! - ymin!) * 111_320).toBeCloseTo(2 * STREETS.halfMeters, -1);
    expect(u.searchParams.get("outSR")).toBe("4326");
    expect(u.searchParams.get("f")).toBe("json");
  });

  it("reads the roads as lat/lon lines merged by name, dropping anything that isn't a plain point", () => {
    const s = parseStreets(local, false)!;
    expect(s.map((x) => x.name)).toEqual(["Middle Knoll Dr", "Villa Haven Dr", ""]);
    expect(s[0]!.paths).toHaveLength(2);
    expect(s[0]!.paths[0]![0]).toEqual([32.875847, -96.697911]);
    expect(s[2]!.paths[0]).toHaveLength(2);
    expect(parseStreets({ error: { code: 400 } }, false)).toBeNull();
    expect(parseStreets("nope", false)).toBeNull();
  });

  it("keeps a road major when any layer says so", () => {
    const a = parseStreets(local, false)!;
    const b = [{ name: "Villa Haven Dr", major: true, paths: [[[1, 2], [3, 4]]] as [number, number][][] }];
    const m = mergeStreets([a, b]);
    const v = m.find((x) => x.name === "Villa Haven Dr")!;
    expect(v.major).toBe(true);
    expect(v.paths).toHaveLength(2);
    expect(a.find((x) => x.name === "Villa Haven Dr")!.paths).toHaveLength(1); // the inputs aren't changed
  });

  it("asks all three road layers and says why when TIGERweb fails", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(local), { headers: { "content-type": "application/json" } }));
    const r = await fetchStreets(32.875659, -96.694949, { fetch: ok as never });
    expect(ok).toHaveBeenCalledTimes(3);
    expect(r.ok && r.streets.find((s) => s.name === "Middle Knoll Dr")?.major).toBe(true);
    const down = vi.fn(async () => new Response("busy", { status: 503 }));
    expect(await fetchStreets(32.8, -96.7, { fetch: down as never })).toEqual({ ok: false, reason: "TIGERweb answered HTTP 503" });
    const err = vi.fn(async () => new Response(JSON.stringify({ error: { code: 500 } })));
    expect(await fetchStreets(32.8, -96.7, { fetch: err as never })).toEqual({ ok: false, reason: "TIGERweb sent no roads" });
  });

  it("writes a name halfway along the longest stretch inside the map, upright", () => {
    const flat = labelSpot([[{ x: -50, y: 300 }, { x: 700, y: 300 }]], 640)!;
    expect(Math.abs(flat.x - 320)).toBeLessThan(5);
    expect(flat.y).toBe(300);
    expect(flat.angle).toBeCloseTo(0, 6);
    // A street drawn right to left still reads left to right.
    const back = labelSpot([[{ x: 600, y: 100 }, { x: 60, y: 100 }]], 640)!;
    expect(Math.abs(back.angle)).toBeLessThanOrEqual(90);
    const down = labelSpot([[{ x: 300, y: 60 }, { x: 300, y: 600 }]], 640)!;
    expect(Math.abs(down.angle)).toBeCloseTo(90, 6);
    // A stub too short to hold a name, or a line outside the map, gets none.
    expect(labelSpot([[{ x: 300, y: 300 }, { x: 340, y: 300 }]], 640)).toBeNull();
    expect(labelSpot([[{ x: -100, y: 10 }, { x: 900, y: 10 }]], 640)).toBeNull();
  });

  it("moves a name along the street to keep it off the front arrow", () => {
    const arrow = { a: { x: 320, y: 320 }, b: { x: 320, y: 128 } };
    const half = 90;
    const spot = labelSpot([[{ x: 0, y: 200 }, { x: 640, y: 200 }]], 640, { avoid: (p) => segmentGap(...labelEnds(p, half), arrow.a, arrow.b) < 20 })!;
    expect(Math.abs(spot.x - 320)).toBeGreaterThanOrEqual(half + 20);
    expect(segmentGap({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(0);
    expect(segmentGap({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(5);
    expect(labelSpot([[{ x: 0, y: 200 }, { x: 640, y: 200 }]], 640, { avoid: () => true })).toBeNull();
    expect(distToSegment({ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 })).toBe(5);
  });

  it("names each street once, major roads first, clear of the front arrow and each other", () => {
    const line = (y: number) => [[{ x: 0, y }, { x: 640, y }]];
    const labels = placeLabels(
      [
        { name: "Middle Knoll Dr", major: false, paths: line(200) },
        { name: "Middle Knoll Dr", major: false, paths: line(205) },
        { name: "Abrams Rd", major: true, paths: line(210) },
        { name: "", major: false, paths: line(400) },
      ],
      640,
      { keepClear: KEEP_CLEAR, house: { x: 320, y: 320 }, arrowEnd: { x: 320, y: 128 } },
    );
    expect(labels[0]!.name).toBe("Abrams Rd");
    expect(labels.filter((l) => l.name === "Middle Knoll Dr").length).toBeLessThanOrEqual(1);
    for (const l of labels) expect(segmentGap(...labelEnds(l, l.name.length * 6.3 + 8), { x: 320, y: 320 }, { x: 320, y: 128 })).toBeGreaterThanOrEqual(20);
    const [a, b] = labels;
    if (a && b) expect(segmentGap(...labelEnds(a, 60), ...labelEnds(b, 60))).toBeGreaterThan(0);
  });
});
