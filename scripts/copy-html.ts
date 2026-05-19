import { mkdir } from "node:fs/promises";

const src = Bun.file("src/index.html");
const html = await src.text();
await mkdir("dist", { recursive: true });
await Bun.write("dist/index.html", html);
await Bun.write("dist/.nojekyll", "");
console.log("[copy-html] wrote dist/index.html");
