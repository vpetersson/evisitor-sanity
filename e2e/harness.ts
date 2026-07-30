/**
 * Shared harness for the browser tests: serves ./dist on an ephemeral port and
 * hands out pages.
 *
 * These tests exist because the bugs this project keeps hitting are layout and
 * interaction bugs, and the unit suite cannot see them. A stylesheet that gives
 * a section no spacing, a control that never shows it is invalid, or a field
 * that renders next to the wrong neighbour all pass happy-dom and typecheck
 * happily, then land in front of a user.
 */

import { chromium, type Browser, type Page } from "playwright";

let server: ReturnType<typeof Bun.serve> | null = null;
let browser: Browser | null = null;

// The test files share one process, and bun may run them concurrently. Without
// a refcount the first file to finish called stopHarness and closed the browser
// the others were still driving, which showed up as a hung test and a timed-out
// hook rather than anything to do with the app.
let users = 0;
let starting: Promise<string> | null = null;

export function startHarness(): Promise<string> {
  users += 1;
  if (starting) return starting;
  starting = boot();
  return starting;
}

async function boot(): Promise<string> {
  const root = new URL("../dist", import.meta.url).pathname;
  // Fail loudly rather than testing a stale or missing build.
  if (!(await Bun.file(`${root}/index.html`).exists())) {
    throw new Error(`No build at ${root}. Run "bun run build" first.`);
  }
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const p = decodeURIComponent(new URL(req.url).pathname);
      for (const cand of [p, p.replace(/\/$/, "") + "/index.html"]) {
        const f = Bun.file(root + cand);
        if (await f.exists()) {
          const st = await f.stat();
          if (!st.isDirectory()) return new Response(f);
        }
      }
      return new Response("not found", { status: 404 });
    },
  });
  browser = await chromium.launch();
  return `http://localhost:${server.port}`;
}

export async function stopHarness(): Promise<void> {
  users -= 1;
  if (users > 0) return; // another test file is still using it
  await browser?.close();
  server?.stop(true);
  browser = null;
  server = null;
  starting = null;
}

export type OpenOpts = {
  width?: number;
  height?: number;
  scheme?: "light" | "dark";
  mode?: "guest" | "host";
};

export async function open(base: string, opts: OpenOpts = {}): Promise<Page> {
  if (!browser) throw new Error("harness not started");
  const page = await browser.newPage({
    viewport: { width: opts.width ?? 1280, height: opts.height ?? 1000 },
    colorScheme: opts.scheme ?? "light",
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  (page as Page & { jsErrors: string[] }).jsErrors = errors;

  await page.goto(base + "/", { waitUntil: "networkidle" });
  // The stylesheet must actually be applied, or every layout assertion below
  // would pass against an unstyled page.
  const rules = await page.evaluate(() => {
    let n = 0;
    for (const s of document.styleSheets) {
      try {
        n += s.cssRules.length;
      } catch {
        /* cross-origin */
      }
    }
    return n;
  });
  if (rules < 100) throw new Error(`only ${rules} CSS rules applied; page is unstyled`);

  if (opts.mode) {
    await page.click(`[data-pick-mode="${opts.mode}"]`);
    await page.waitForSelector(`#${opts.mode}-flow:not([hidden])`);
  }
  return page;
}

/** Vertical gaps between the visible sections of whichever flow is showing. */
export async function sectionGaps(page: Page): Promise<{ pair: string; px: number }[]> {
  return page.evaluate(() => {
    const flow = [...document.querySelectorAll("#guest-flow,#host-flow,#mode-chooser")]
      .find((e) => !(e as HTMLElement).hidden);
    if (!flow) return [];
    const kids = [...flow.children].filter((e) => e.getBoundingClientRect().height > 0);
    const out: { pair: string; px: number }[] = [];
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i]!.getBoundingClientRect();
      const b = kids[i + 1]!.getBoundingClientRect();
      const name = (el: Element) =>
        (typeof el.className === "string" && el.className.split(" ")[0]) || el.tagName;
      out.push({ pair: `${name(kids[i]!)} -> ${name(kids[i + 1]!)}`, px: Math.round(b.top - a.top - a.height) });
    }
    return out;
  });
}
