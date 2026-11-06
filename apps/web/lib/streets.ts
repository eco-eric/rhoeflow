/**
 * Streets on the satellite map (ADR-045): the road centre lines round the house, with their names,
 * from the US Census Bureau's TIGER/Line roads through its public TIGERweb map service (public
 * domain, no key, no account). The map draws them as blue dashed lines, as a map app does over its
 * satellite view, so the tech can tell the street the house faces from an alley behind it: many
 * DFW houses back onto a paved alley that looks like a street from above, while the street itself
 * hides under the trees.
 */

import { IMAGERY } from "./imagery";

const P = IMAGERY.px;
const M = P / 2;
/** Spots a street name stays off (x, y, radius): the compass letters, the north arrow, the scale bar and the zoom buttons. */
export const KEEP_CLEAR = [
  [M, 26, 34],
  [P - 26, M, 30],
  [M, P - 24, 30],
  [26, M, 30],
  [62, 62, 54],
  [70, P - 36, 50],
  [P - 52, P - 84, 70],
] as const;

export const STREETS = {
  service: "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Transportation/MapServer",
  /** Primary roads, secondary roads and local roads (TIGERweb layers 2, 6 and 8). */
  layers: [2, 6, 8] as const,
  /** Ground each side of the house to fetch; covers the widest zoom step with room to spare. */
  halfMeters: 300,
  credit: "Streets: US Census Bureau TIGER",
  source: "US Census Bureau TIGER/Line roads (TIGERweb)",
};

/** One named road near the house: its centre lines as [lat, lon] points. Unnamed roads have name "". */
export type Street = { name: string; major: boolean; paths: [number, number][][] };

/** The TIGERweb query for one layer's roads in a square round the point, in lat/lon. */
export function streetsQueryUrl(layer: number, lat: number, lon: number, halfMeters = STREETS.halfMeters): string {
  const dLat = halfMeters / 111_320;
  const dLon = halfMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const u = new URL(`${STREETS.service}/${layer}/query`);
  u.searchParams.set("geometry", [lon - dLon, lat - dLat, lon + dLon, lat + dLat].map((v) => v.toFixed(6)).join(","));
  u.searchParams.set("geometryType", "esriGeometryEnvelope");
  u.searchParams.set("inSR", "4326");
  u.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  u.searchParams.set("outFields", "NAME");
  u.searchParams.set("outSR", "4326");
  u.searchParams.set("returnGeometry", "true");
  u.searchParams.set("geometryPrecision", "6");
  u.searchParams.set("f", "json");
  return u.toString();
}

const MAX_STREETS = 80;
const MAX_POINTS = 4000;

/**
 * The roads in one TIGERweb answer, merged by name. Anything that isn't a polyline answer, or a
 * point that isn't a plain lat/lon, is left out; an error answer gives null.
 */
export function parseStreets(body: unknown, major: boolean): Street[] | null {
  if (!body || typeof body !== "object" || "error" in body) return null;
  const features = (body as { features?: unknown }).features;
  if (!Array.isArray(features)) return null;
  const byName = new Map<string, Street>();
  let points = 0;
  for (const f of features) {
    const name = typeof f?.attributes?.NAME === "string" ? f.attributes.NAME.trim().slice(0, 60) : "";
    const paths = f?.geometry?.paths;
    if (!Array.isArray(paths)) continue;
    for (const path of paths) {
      if (!Array.isArray(path)) continue;
      const pts: [number, number][] = [];
      for (const p of path) {
        if (!Array.isArray(p) || typeof p[0] !== "number" || typeof p[1] !== "number") continue;
        const [lon, lat] = p as [number, number];
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        pts.push([lat, lon]);
      }
      if (pts.length < 2 || points + pts.length > MAX_POINTS) continue;
      points += pts.length;
      const s: Street = byName.get(name) ?? { name, major, paths: [] };
      s.paths.push(pts);
      byName.set(name, s);
    }
  }
  return [...byName.values()].slice(0, MAX_STREETS);
}

/** Streets from several layers merged by name; a road in a major layer stays major. */
export function mergeStreets(lists: Street[][]): Street[] {
  const out = new Map<string, Street>();
  for (const list of lists) {
    for (const s of list) {
      const have = out.get(s.name);
      if (have) {
        have.paths.push(...s.paths);
        have.major ||= s.major;
      } else out.set(s.name, { ...s, paths: [...s.paths] });
    }
  }
  return [...out.values()].slice(0, MAX_STREETS);
}

export type StreetsResult = { ok: true; streets: Street[] } | { ok: false; reason: string };

/** The roads round a point from TIGERweb. Never throws; a layer that fails is reported. */
export async function fetchStreets(lat: number, lon: number, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<StreetsResult> {
  const f = opts.fetch ?? globalThis.fetch;
  try {
    const lists = await Promise.all(
      STREETS.layers.map(async (layer) => {
        const res = await f(streetsQueryUrl(layer, lat, lon), { signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000), headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`TIGERweb answered HTTP ${res.status}`);
        const parsed = parseStreets(await res.json(), layer !== 8);
        if (!parsed) throw new Error("TIGERweb sent no roads");
        return parsed;
      }),
    );
    return { ok: true, streets: mergeStreets(lists) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? (e.name === "TimeoutError" ? "TIGERweb took too long" : e.message) : "fetch failed" };
  }
}

/**
 * Where to write a street's name on the map: halfway along the longest run of its line inside the
 * map (kept `margin` from the edge), turned to follow the street and kept upright. Null when no run
 * is long enough to hold a name.
 */
export function labelSpot(
  paths: { x: number; y: number }[][],
  size: number,
  opts: { margin?: number; minRun?: number; avoid?: (spot: { x: number; y: number; angle: number }) => boolean } = {},
): { x: number; y: number; angle: number } | null {
  const { margin = 36, minRun = 150, avoid = () => false } = opts;
  const inside = (p: { x: number; y: number }) => p.x >= margin && p.x <= size - margin && p.y >= margin && p.y <= size - margin;
  let best: { x: number; y: number }[] = [];
  let bestLen = 0;
  const len = (run: { x: number; y: number }[]) => run.reduce((a, p, i) => (i ? a + Math.hypot(p.x - run[i - 1]!.x, p.y - run[i - 1]!.y) : 0), 0);
  // Points every few units along each line, so a long straight segment that crosses the map with
  // both ends outside it still counts.
  const dense = (path: { x: number; y: number }[]) =>
    path.flatMap((b, i) => {
      if (i === 0) return [b];
      const a = path[i - 1]!;
      const n = Math.min(400, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
      return Array.from({ length: n }, (_, j) => ({ x: a.x + ((b.x - a.x) * (j + 1)) / n, y: a.y + ((b.y - a.y) * (j + 1)) / n }));
    });
  for (const path of paths) {
    let run: { x: number; y: number }[] = [];
    for (const p of [...dense(path), { x: NaN, y: NaN }]) {
      if (Number.isFinite(p.x) && inside(p)) run.push(p);
      else {
        const l = len(run);
        if (l > bestLen) [best, bestLen] = [run, l];
        run = [];
      }
    }
  }
  if (bestLen < minRun) return null;
  // The points a little before and after the middle of the run give the street's direction there.
  const at = (d: number) => {
    let walked = 0;
    for (let i = 1; i < best.length; i++) {
      const a = best[i - 1]!;
      const b = best[i]!;
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (walked + l >= d) {
        const t = l ? (d - walked) / l : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      walked += l;
    }
    return best[best.length - 1]!;
  };
  // Halfway along if that spot is clear, else a little either side, so the name stays off the marks.
  for (const frac of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    const d = bestLen * frac;
    if (d < 60 || bestLen - d < 60) continue;
    const mid = at(d);
    const a = at(Math.max(0, d - 40));
    const b = at(Math.min(bestLen, d + 40));
    let angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const spot = { x: mid.x, y: mid.y, angle };
    if (!avoid(spot)) return spot;
  }
  return null;
}

/** How far a point is from the segment a–b. */
export function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2)) : 0;
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}

/** The two ends of a name written at `spot`, about `halfWidth` either side along the street. */
export function labelEnds(spot: { x: number; y: number; angle: number }, halfWidth: number): [{ x: number; y: number }, { x: number; y: number }] {
  const r = (spot.angle * Math.PI) / 180;
  const [dx, dy] = [Math.cos(r) * halfWidth, Math.sin(r) * halfWidth];
  return [
    { x: spot.x - dx, y: spot.y - dy },
    { x: spot.x + dx, y: spot.y + dy },
  ];
}

/** The gap between two segments, 0 where they cross. */
export function segmentGap(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }): number {
  const cross = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(distToSegment(a, c, d), distToSegment(b, c, d), distToSegment(c, a, b), distToSegment(d, a, b));
}

type Pt = { x: number; y: number };

/**
 * One name per street, placed where its whole length stays clear of the other names, the map's own
 * marks (`keepClear`: x, y, radius), the house dot and the front arrow. Major roads get first pick.
 */
export function placeLabels(
  streets: { name: string; major: boolean; paths: Pt[][] }[],
  size: number,
  marks: { keepClear: readonly (readonly [number, number, number])[]; house: Pt; arrowEnd: Pt | null },
): { name: string; x: number; y: number; angle: number }[] {
  // A name's half width, roughly, at the label's 21 px bold.
  const halfWidth = (name: string) => name.length * 6.3 + 8;
  const out: { name: string; x: number; y: number; angle: number; ends: [Pt, Pt] }[] = [];
  for (const s of [...streets].sort((a, b) => Number(b.major) - Number(a.major))) {
    if (!s.name || out.some((l) => l.name === s.name)) continue;
    const hw = halfWidth(s.name);
    const spot = labelSpot(s.paths, size, {
      avoid: (sp) => {
        const [a, b] = labelEnds(sp, hw);
        const { house, arrowEnd } = marks;
        return (
          out.some((l) => segmentGap(a, b, l.ends[0], l.ends[1]) < 26) ||
          marks.keepClear.some(([x, y, r]) => distToSegment({ x, y }, a, b) < r) ||
          distToSegment(house, a, b) < 24 ||
          (arrowEnd !== null && (segmentGap(a, b, house, arrowEnd) < 20 || distToSegment(arrowEnd, a, b) < 40))
        );
      },
    });
    if (spot) out.push({ name: s.name, ...spot, ends: labelEnds(spot, hw) });
  }
  return out.map(({ ends: _ends, ...l }) => l);
}
