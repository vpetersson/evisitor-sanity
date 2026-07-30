/**
 * Runs each browser test file in its own bun process.
 *
 * Sharing one process let a finished file's browser state hang a later file's
 * clicks: the element resolved, was visible, enabled and stable, and the click
 * then never completed. Isolating the processes removes the whole class of
 * problem and costs a few seconds of browser startup.
 */
import { readdirSync } from "node:fs";

const dir = new URL(".", import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith(".test.ts")).sort();

let failed = false;
for (const f of files) {
  console.log(`\n── ${f} ──`);
  const proc = Bun.spawnSync(["bun", "test", `e2e/${f}`], {
    stdout: "inherit",
    stderr: "inherit",
    cwd: new URL("..", import.meta.url).pathname,
  });
  if (proc.exitCode !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
