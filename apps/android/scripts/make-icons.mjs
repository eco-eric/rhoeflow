// Regenerates the launcher icons, splash screens and the 512px Play listing icon from resources/*.svg.
// The PNGs are committed, so this only runs when the icon changes. Needs `sharp`, which is not a
// dependency of this package: run `npm i --no-save sharp` in apps/android first, then `pnpm icons`.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(root, "android/app/src/main/res");
const icon = join(root, "resources/icon.svg");
const foreground = join(root, "resources/foreground.svg");
const SPLASH_BG = "#0e1319";

const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const fg = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const port = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };

const png = (svg, size) => sharp(svg, { density: 1200 }).resize(size, size).png().toBuffer();
const circle = (s) => Buffer.from(`<svg width="${s}" height="${s}"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/></svg>`);
const out = (p) => (mkdirSync(dirname(p), { recursive: true }), p);

for (const [d, s] of Object.entries(legacy)) {
  await sharp(await png(icon, s)).toFile(out(join(res, `mipmap-${d}/ic_launcher.png`)));
  await sharp(await png(icon, s)).composite([{ input: circle(s), blend: "dest-in" }]).toFile(out(join(res, `mipmap-${d}/ic_launcher_round.png`)));
  await sharp(await png(foreground, fg[d])).toFile(out(join(res, `mipmap-${d}/ic_launcher_foreground.png`)));
}
// Splash for Android 11 and older; Android 12+ draws the launcher icon on the theme's splash colour.
const splash = async (w, h, file) => {
  const logo = await png(icon, Math.round(Math.min(w, h) / 4));
  await sharp({ create: { width: w, height: h, channels: 3, background: SPLASH_BG } }).composite([{ input: logo, gravity: "center" }]).png().toFile(out(file));
};
for (const [d, [w, h]] of Object.entries(port)) {
  await splash(w, h, join(res, `drawable-port-${d}/splash.png`));
  await splash(h, w, join(res, `drawable-land-${d}/splash.png`));
}
await splash(480, 800, join(res, "drawable/splash.png"));
// Play listing icon: 512 x 512, no transparency.
await sharp(await png(icon, 512)).flatten({ background: "#1c242c" }).toFile(out(join(root, "resources/play-icon-512.png")));
console.log("icons written");
