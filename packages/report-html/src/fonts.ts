import { FONT_FILES } from "./fonts.generated.js";

/**
 * The report's embedded fonts (ADR-037: "font embedded", plan §Openness: bundle fonts, no CDN).
 * Geist and Geist Mono (SIL OFL 1.1, fonts/OFL.txt), the files Next.js 16.4.3 ships for its dev
 * overlay, carried as data URLs so the browser that prints the PDF loads nothing from outside and
 * Browser Run and CI's Chromium draw the same glyphs. Unicode ranges are Google Fonts' latin and
 * latin-ext subsets, which the files were cut to.
 */
const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

const FACES: { family: string; file: string; range: string }[] = [
  { family: "Geist", file: "geist-latin.woff2", range: LATIN },
  { family: "Geist", file: "geist-latin-ext.woff2", range: LATIN_EXT },
  { family: "Geist Mono", file: "geist-mono-latin.woff2", range: LATIN },
  { family: "Geist Mono", file: "geist-mono-latin-ext.woff2", range: LATIN_EXT },
];

/** `@font-face` rules with the font files inlined. Variable fonts: one file covers weights 100 to 900. */
export function fontFaceCss(): string {
  return FACES.map((f) => {
    const file = FONT_FILES[f.file];
    if (!file) throw new Error(`font ${f.file} is not embedded; run the package's "fonts" script`);
    return `@font-face { font-family: "${f.family}"; font-style: normal; font-weight: 100 900; font-display: block; src: url(data:font/woff2;base64,${file.base64}) format("woff2"); unicode-range: ${f.range}; }`;
  }).join("\n");
}
