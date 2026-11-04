/**
 * Satellite view of the lot (ADR-043). USGS The National Map's "USGS Imagery Only" service: USDA
 * NAIP orthoimagery, public domain, no key and no map library (the job page draws the tiles in an
 * SVG). Esri's sharper imagery needs a map library and an ArcGIS account, so it waits on a yes.
 */

/** USGS The National Map, "USGS Imagery Only": tiles are /tile/{z}/{y}/{x}, 256 px, Web Mercator. */
export const IMAGERY = {
  tile: (z: number, x: number, y: number) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`,
  zoom: 19,
  credit: "Imagery: USGS The National Map, USDA NAIP",
  source: "USGS The National Map orthoimagery (USDA NAIP)",
};

/** World pixel position of a point at zoom z (256 px tiles, Web Mercator). */
export function worldPixel(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 256 * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

/** Compass bearing (0 = north, clockwise) from one pixel to another, snapped to the 8 quick-pass choices. */
export function bearingToCompass(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const deg = (Math.atan2(to.x - from.x, from.y - to.y) * 180) / Math.PI;
  return (Math.round(((deg + 360) % 360) / 45) * 45) % 360;
}

