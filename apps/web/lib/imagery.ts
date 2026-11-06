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

/**
 * Esri World Imagery (ADR-044): sharper than NAIP (about 0.3 m in DFW), through ArcGIS location
 * services with the `ARCGIS_API_KEY` secret. The browser never sees the key; it asks
 * `/api/imagery/tile/{z}/{x}/{y}` (lib/imagery-server.ts). Esri's terms ask for "Powered by Esri"
 * and the imagery providers on the map.
 */
export const ESRI = {
  tile: (z: number, x: number, y: number) => `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  /** Where the job page asks for a tile; the server adds the key. */
  proxy: (z: number, x: number, y: number) => `/api/imagery/tile/${z}/${x}/${y}`,
  /** The site the key allows. */
  referer: "https://app.rhoeflow.pro/",
  zoom: 19,
  minZoom: 15,
  maxZoom: 20,
  credit: "Powered by Esri. Imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  source: "Esri World Imagery (ArcGIS location services)",
};

export type ImagerySource = "esri" | "naip";

/** Credit and source text for the imagery in use. */
export function imageryMeta(s: ImagerySource): { credit: string; source: string } {
  return s === "esri" ? { credit: ESRI.credit, source: ESRI.source } : { credit: IMAGERY.credit, source: IMAGERY.source };
}

const R = 6378137; // Web Mercator sphere radius, metres

/** Web Mercator (EPSG:3857) metres for a point. */
export function mercator(lat: number, lon: number): { x: number; y: number } {
  const r = (lat * Math.PI) / 180;
  return { x: (R * lon * Math.PI) / 180, y: R * Math.log(Math.tan(Math.PI / 4 + r / 2)) };
}

/**
 * The 256 px tiles at zoom `z` that cover the same ground square as the NAIP picture, each placed
 * in the `px` square the map is drawn in, so either source lines up with the marks on top.
 */
export function esriTiles(lat: number, lon: number, halfMeters = IMAGERY.halfMeters, px = IMAGERY.px, z = ESRI.zoom): { z: number; x: number; y: number; left: number; top: number; size: number }[] {
  const world = 256 * 2 ** z; // world pixels at this zoom
  const perMeter = world / (2 * Math.PI * R); // world pixels per Mercator metre
  const m = mercator(lat, lon);
  const cx = (m.x + Math.PI * R) * perMeter;
  const cy = (Math.PI * R - m.y) * perMeter;
  const h = (halfMeters / Math.cos((lat * Math.PI) / 180)) * perMeter; // half the square, world pixels
  const k = px / (2 * h);
  const out: { z: number; x: number; y: number; left: number; top: number; size: number }[] = [];
  for (let tx = Math.floor((cx - h) / 256); tx <= Math.floor((cx + h) / 256); tx++) {
    for (let ty = Math.floor((cy - h) / 256); ty <= Math.floor((cy + h) / 256); ty++) {
      out.push({ z, x: tx, y: ty, left: (tx * 256 - (cx - h)) * k, top: (ty * 256 - (cy - h)) * k, size: 256 * k });
    }
  }
  return out;
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
