/**
 * Converts the woff2 files shipped by @fontsource into TTF for the PDF
 * renderer (@react-pdf/renderer → fontkit reads TTF/OTF, not woff2).
 *
 * The result lives in assets/fonts/ and IS committed: the app must build and
 * run offline, and the PDF must have Czech diacritics on any machine
 * (docs/DECISIONS.md D-010). Re-run after bumping the font packages:
 *
 *   node scripts/build-pdf-fonts.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decompress } from "wawoff2";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "assets", "fonts");

// latin-ext covers the Czech letters that plain latin misses (ě š č ř ž ů ď ť ň).
const FONTS = [
  ["@fontsource/fraunces/files/fraunces-latin-ext-400-normal.woff2", "Fraunces-Regular.ttf"],
  ["@fontsource/fraunces/files/fraunces-latin-ext-700-normal.woff2", "Fraunces-Bold.ttf"],
  ["@fontsource/inter/files/inter-latin-ext-400-normal.woff2", "Inter-Regular.ttf"],
  ["@fontsource/inter/files/inter-latin-ext-600-normal.woff2", "Inter-SemiBold.ttf"],
];

await mkdir(outDir, { recursive: true });
for (const [source, target] of FONTS) {
  const woff2 = await readFile(path.join(root, "node_modules", source));
  const ttf = await decompress(woff2);
  await writeFile(path.join(outDir, target), Buffer.from(ttf));
  console.log(`${target}  ${(ttf.length / 1024).toFixed(0)} kB`);
}
