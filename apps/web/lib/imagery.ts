/**
 * Satellite view of the lot (ADR-043, ADR-044). One image of USDA NAIP orthoimagery from USGS The
 * National Map's NAIP ImageServer (public domain, no key, no map library), centred on the house
 * and north up. The tiled "USGS Imagery Only" basemap first used here is only cached to zoom 16,
 * too coarse to see a house, so its zoom 19 tiles came back empty; the ImageServer draws any box
 * at NAIP's own resolution (about 0.6 m).
 */

export const IMAGERY = {
  service: "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage",
  /** Ground shown each side of the house, metres. 60 m shows the lot, the street and the neighbours. */
  halfMeters: 60,
  /** Image size in pixels; the map is drawn in a square viewBox of this size. */
  px: 640,
  credit: "Imagery: USDA NAIP through USGS The National Map",
  source: "USDA NAIP orthoimagery (USGS The National Map)",
};

const R = 6378137; // Web Mercator sphere radius, metres

/** Web Mercator (EPSG:3857) metres for a point. */
export function mercator(lat: number, lon: number): { x: number; y: number } {
  const r = (lat * Math.PI) / 180;
  return { x: (R * lon * Math.PI) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + r / 2)) };
}

/**
 * The NAIP image for a square around the point, north up. Mercator stretches ground distance by
 * 1 / cos(latitude), so the box is widened by that much to show `halfMeters` of real ground.
 */
export function satelliteImageUrl(lat: number, lon: number, halfMeters = IMAGERY.halfMeters, px = IMAGERY.px): string {
  const c = mercator(lat, lon);
  const h = halfMeters / Math.cos((lat * Math.PI) / 180);
  const u = new URL(IMAGERY.service);
  u.searchParams.set("bbox", [c.x - h, c.y - h, c.x + h, c.y + h].map((v) => v.toFixed(1)).join(","));
  u.searchParams.set("bboxSR", "3857");
  u.searchParams.set("imageSR", "3857");
  u.searchParams.set("size", `${px},${px}`);
  u.searchParams.set("format", "jpgpng");
  u.searchParams.set("f", "image");
  return u.toString();
}

export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** A bearing snapped to the 8 quick-pass choices (0 = N, 45 = NE, …). */
export function snapToCompass(deg: number): number {
  return (Math.round((((deg % 360) + 360) % 360) / 45) * 45) % 360;
}

/** "N", "NE", … for a bearing. */
export function compassLabel(deg: number): (typeof DIRECTIONS)[number] {
  return DIRECTIONS[snapToCompass(deg) / 45]!;
}

/** Bearing in degrees (0 = north, clockwise) from one map point to another; the map is north up. */
export function bearing(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const deg = (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Bearing from one map point to another, snapped to the 8 quick-pass choices. */
export function bearingToCompass(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return snapToCompass(bearing(from, to));
}

/** The point `len` from `from` in the direction `deg` (map is north up, y grows down). */
export function pointToward(from: { x: number; y: number }, deg: number, len: number): { x: number; y: number } {
  const r = (deg * Math.PI) / 180;
  return { x: from.x + Math.sin(r) * len, y: from.y - Math.cos(r) * len };
}

/**
 * The phone's compass heading (0 = north, clockwise) from a device orientation event, or null when
 * the event carries no true heading. iOS gives `webkitCompassHeading`; Android gives an absolute
 * `alpha`, which turns the other way. Either way the heading is where the top of the phone points,
 * corrected for a phone held sideways.
 */
export function headingFromOrientation(
  e: { alpha: number | null; absolute?: boolean; webkitCompassHeading?: number | null | undefined },
  screenAngle = 0,
): number | null {
  let h: number | null = null;
  if (typeof e.webkitCompassHeading === "number" && Number.isFinite(e.webkitCompassHeading)) h = e.webkitCompassHeading;
  else if (e.absolute && typeof e.alpha === "number" && Number.isFinite(e.alpha)) h = 360 - e.alpha;
  if (h === null) return null;
  return (((h + screenAngle) % 360) + 360) % 360;
}
