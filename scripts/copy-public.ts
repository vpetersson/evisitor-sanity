import { mkdir, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const FONT_SOURCES: Array<{ pkg: string; files: string[] }> = [
  {
    pkg: "node_modules/@fontsource-variable/fraunces/files",
    files: [
      "fraunces-latin-wght-normal.woff2",
      "fraunces-latin-ext-wght-normal.woff2",
      "fraunces-latin-wght-italic.woff2",
    ],
  },
  {
    pkg: "node_modules/@fontsource-variable/geist/files",
    files: [
      "geist-latin-wght-normal.woff2",
      "geist-latin-ext-wght-normal.woff2",
    ],
  },
  {
    pkg: "node_modules/@fontsource-variable/geist-mono/files",
    files: [
      "geist-mono-latin-wght-normal.woff2",
      "geist-mono-latin-ext-wght-normal.woff2",
    ],
  },
];

const fontsOut = "dist/assets/fonts";
await mkdir(fontsOut, { recursive: true });

for (const src of FONT_SOURCES) {
  for (const file of src.files) {
    const from = join(src.pkg, file);
    const to = join(fontsOut, file);
    if (!existsSync(from)) {
      console.warn(`[copy-public] missing font ${from} — skipping`);
      continue;
    }
    await copyFile(from, to);
  }
}
console.log(`[copy-public] wrote ${fontsOut}`);

if (existsSync("public")) {
  const entries = await readdir("public", { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await copyFile(join("public", entry.name), join("dist", entry.name));
  }
  console.log("[copy-public] copied public/ → dist/");
}
