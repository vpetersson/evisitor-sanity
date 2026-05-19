import { watch } from "node:fs";
import { spawn } from "bun";

const PORT = Number(process.env["PORT"] ?? 3000);

async function rebuild(label: string): Promise<void> {
  const start = performance.now();
  const proc = spawn(["bun", "run", "build"], { stdout: "inherit", stderr: "inherit" });
  const exitCode = await proc.exited;
  const ms = (performance.now() - start).toFixed(0);
  if (exitCode === 0) console.log(`[dev] ${label} rebuilt in ${ms}ms`);
  else console.error(`[dev] ${label} build failed (exit ${exitCode})`);
}

await rebuild("initial");

watch("src", { recursive: true }, (_event, filename) => {
  if (!filename) return;
  void rebuild(`src/${filename}`);
});

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`dist${path}`);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`[dev] serving http://localhost:${server.port}`);
