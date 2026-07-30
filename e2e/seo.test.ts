import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { open, startHarness, stopHarness } from "./harness.ts";
import { chromium } from "playwright";

let base = "";
beforeAll(async () => {
  base = await startHarness();
});
afterAll(stopHarness);

describe("the page is legible without JavaScript", () => {
  // Every flow section used to ship `hidden` and JS revealed one on boot, so a
  // crawler that does not run scripts saw a page whose h1 and entire pitch were
  // invisible. Google renders JS; most social and LLM crawlers do not.
  test("the h1 and the pitch render with scripting disabled", async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(base + "/", { waitUntil: "load" });

    const seen = await page.evaluate(() => {
      const visible = (el: Element) => el.getBoundingClientRect().height > 0;
      const h1 = [...document.querySelectorAll("h1")].find(visible);
      return {
        h1: h1?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        chars: (document.body.innerText || "").trim().length,
      };
    });

    expect(seen.h1).toBeTruthy();
    expect(seen.chars).toBeGreaterThan(1500);
    await ctx.close();
    await browser.close();
  }, 60_000);
});

describe("head metadata", () => {
  test("carries canonical, social and structured data", async () => {
    const page = await open(base);
    const meta = await page.evaluate(() => {
      const attr = (sel: string, a: string) => document.querySelector(sel)?.getAttribute(a) ?? null;
      const ld = document.querySelector('script[type="application/ld+json"]')?.textContent ?? "";
      return {
        title: document.title,
        description: attr('meta[name="description"]', "content"),
        canonical: attr('link[rel="canonical"]', "href"),
        ogTitle: attr('meta[property="og:title"]', "content"),
        ogImage: attr('meta[property="og:image"]', "content"),
        twitterCard: attr('meta[name="twitter:card"]', "content"),
        themeLight: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
        lang: document.documentElement.lang,
        ld: ld ? (JSON.parse(ld) as Record<string, unknown>) : null,
      };
    });

    expect(meta.title.length).toBeGreaterThan(20);
    expect(meta.title.length).toBeLessThanOrEqual(70); // stays whole in a SERP
    expect((meta.description ?? "").length).toBeGreaterThan(70);
    // Search results truncate around 160 characters; past that the tail is wasted.
    expect((meta.description ?? "").length).toBeLessThanOrEqual(160);
    expect(meta.canonical).toBe("https://checkin.villalavacroatia.com/");
    expect(meta.ogTitle).toBeTruthy();
    expect(meta.ogImage).toMatch(/og\.png$/);
    expect(meta.twitterCard).toBe("summary_large_image");
    expect(meta.lang).toBe("en");
    // The palette moved to Catppuccin; the browser chrome has to move with it.
    expect(meta.themeLight).toBe("#e6e9ef");
    expect(meta.ld?.["@type"]).toBe("WebApplication");
    await page.close();
  });

  test("has exactly one h1 per visible view", async () => {
    for (const mode of [undefined, "guest", "host"] as const) {
      const page = await open(base, mode ? { mode } : {});
      const count = await page.evaluate(
        () => [...document.querySelectorAll("h1")].filter((e) => e.getBoundingClientRect().height > 0).length,
      );
      expect(count).toBe(1);
      await page.close();
    }
  }, 60_000);
});

describe("crawler and agent files", () => {
  for (const [path, must] of [
    ["/robots.txt", "Sitemap: https://checkin.villalavacroatia.com/sitemap.xml"],
    ["/sitemap.xml", "<loc>https://checkin.villalavacroatia.com/</loc>"],
    ["/llms.txt", "# Check-in for Croatia"],
    ["/llms-full.txt", "TouristCheckIns"],
  ] as const) {
    test(`${path} is served and points at the real host`, async () => {
      const res = await fetch(base + path);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain(must);
      // A build that baked in a dev host would quietly ship broken links.
      expect(body).not.toContain("localhost");
    });
  }

  test("og.png is a real 1200x630 image", async () => {
    const res = await fetch(base + "/og.png");
    expect(res.status).toBe(200);
    const buf = new Uint8Array(await res.arrayBuffer());
    // PNG magic, then width/height from the IHDR chunk.
    expect([...buf.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const view = new DataView(buf.buffer);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(630);
  });
});
