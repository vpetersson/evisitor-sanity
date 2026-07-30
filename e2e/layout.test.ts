import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { open, sectionGaps, startHarness, stopHarness } from "./harness.ts";

let base = "";
beforeAll(async () => {
  base = await startHarness();
});
afterAll(stopHarness);

describe("page rhythm", () => {
  // Regression: #guest-flow and #host-flow had no layout rules, so .main-stack's
  // gap only ever reached the flow wrappers. Every section inside them butted
  // against the next at 0px. Nothing in the unit suite could see it.
  for (const mode of ["guest", "host"] as const) {
    test(`${mode} sections are spaced apart`, async () => {
      const page = await open(base, { mode });
      const gaps = await sectionGaps(page);
      expect(gaps.length).toBeGreaterThan(0);
      for (const g of gaps) {
        expect(g.px).toBeGreaterThanOrEqual(16);
      }
      await page.close();
    });
  }

  test("cards do not touch on a narrow viewport either", async () => {
    const page = await open(base, { mode: "host", width: 390, height: 844 });
    const gaps = await sectionGaps(page);
    for (const g of gaps) expect(g.px).toBeGreaterThanOrEqual(16);
    await page.close();
  });
});

describe("no horizontal overflow", () => {
  for (const width of [320, 360, 390, 599, 768, 1280]) {
    test(`${width}px wide`, async () => {
      const page = await open(base, { mode: "host", width, height: 900 });
      const { doc, view } = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        view: document.documentElement.clientWidth,
      }));
      expect(doc).toBeLessThanOrEqual(view);
      await page.close();
    });
  }
});

describe("form layout", () => {
  // Regression: the grid flows in source order and citizenship sat between the
  // country/city pairs, so "City of birth" rendered beside "Country of
  // residence" and each pair was split across two rows.
  test("country and city sit on the same row", async () => {
    const page = await open(base, { mode: "guest", width: 1280 });
    const rows = await page.evaluate(() => {
      const top = (sel: string) => {
        const el = document.querySelector(`[data-field="${sel}"]`);
        return el ? Math.round(el.getBoundingClientRect().top) : null;
      };
      return {
        cob: top("countryOfBirth"),
        cityB: top("cityOfBirth"),
        cor: top("countryOfResidence"),
        cityR: top("cityOfResidence"),
      };
    });
    expect(rows.cob).not.toBeNull();
    expect(rows.cob).toBe(rows.cityB);
    expect(rows.cor).toBe(rows.cityR);
    await page.close();
  });

  test("the help button sits next to its own label, not the next column", async () => {
    const page = await open(base, { mode: "guest", width: 1280 });
    const gaps = await page.evaluate(() =>
      [...document.querySelectorAll(".field-label-row")].slice(0, 6).map((row) => {
        const lab = row.querySelector(".field-label")!.getBoundingClientRect();
        const btn = row.querySelector(".help-btn")!.getBoundingClientRect();
        return Math.round(btn.left - lab.right);
      }),
    );
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) expect(g).toBeLessThanOrEqual(16);
    await page.close();
  });

  test("the sex control lines up with the inputs beside it", async () => {
    const page = await open(base, { mode: "guest", width: 1280 });
    const { group, input } = await page.evaluate(() => ({
      group: document.querySelector(".gender-group")!.getBoundingClientRect().height,
      input: document.querySelector(".field-input")!.getBoundingClientRect().height,
    }));
    expect(Math.abs(group - input)).toBeLessThanOrEqual(2);
    await page.close();
  });
});

describe("validation surfaces on every control", () => {
  // Regression: applyCardState set aria-invalid on .gender-group like the inputs,
  // but the stylesheet only matched .field-input/.field-select, so the sex
  // control was the one required field that never turned red.
  test("saving an empty form marks the sex control too", async () => {
    const page = await open(base, { mode: "guest", width: 1280 });
    await page.click("#btn-guest-download");
    await page.waitForTimeout(400);

    const state = await page.evaluate(() => {
      const g = document.querySelector(".gender-group") as HTMLElement;
      const cs = getComputedStyle(g);
      const input = document.querySelector('.field-input[aria-invalid="true"]') as HTMLElement;
      return {
        groupInvalid: g.getAttribute("aria-invalid"),
        groupBorder: cs.borderColor,
        inputBorder: input ? getComputedStyle(input).borderColor : null,
      };
    });
    expect(state.groupInvalid).toBe("true");
    // Same treatment as an invalid input, rather than the resting border.
    expect(state.groupBorder).toBe(state.inputBorder);
    await page.close();
  });

  test("an error message appears for each empty required field", async () => {
    const page = await open(base, { mode: "guest", width: 1280 });
    await page.click("#btn-guest-download");
    await page.waitForTimeout(400);
    const shown = await page.evaluate(
      () => [...document.querySelectorAll(".field-error")].filter((e) => !(e as HTMLElement).hidden).length,
    );
    expect(shown).toBeGreaterThan(0);
    await page.close();
  });
});

describe("sex control responds to clicks", () => {
  // Regression: the pills are stamped with aria-pressed once at build time and
  // the card refreshes in place, so clicking one set the value while both pills
  // stayed visually unselected. The control looked broken.
  test("clicking a pill marks it pressed and the other not", async () => {
    const page = await open(base, { mode: "guest" });
    await page.click('.gender-pill[data-gender="M"]');
    await page.waitForTimeout(250);
    let state = await page.evaluate(() =>
      [...document.querySelectorAll(".gender-pill")].map((b) => ({
        g: (b as HTMLElement).dataset["gender"],
        pressed: b.getAttribute("aria-pressed"),
      })),
    );
    expect(state.find((s) => s.g === "M")?.pressed).toBe("true");
    expect(state.find((s) => s.g === "F")?.pressed).toBe("false");

    // And it must move, not just latch on.
    await page.click('.gender-pill[data-gender="F"]');
    await page.waitForTimeout(250);
    state = await page.evaluate(() =>
      [...document.querySelectorAll(".gender-pill")].map((b) => ({
        g: (b as HTMLElement).dataset["gender"],
        pressed: b.getAttribute("aria-pressed"),
      })),
    );
    expect(state.find((s) => s.g === "F")?.pressed).toBe("true");
    expect(state.find((s) => s.g === "M")?.pressed).toBe("false");
    await page.close();
  });

  test("the pressed pill is visually distinct from the unpressed one", async () => {
    const page = await open(base, { mode: "guest" });
    await page.click('.gender-pill[data-gender="M"]');
    await page.waitForTimeout(250);
    const { on, off } = await page.evaluate(() => ({
      on: getComputedStyle(document.querySelector('.gender-pill[data-gender="M"]')!).backgroundColor,
      off: getComputedStyle(document.querySelector('.gender-pill[data-gender="F"]')!).backgroundColor,
    }));
    expect(on).not.toBe(off);
    await page.close();
  });
});

describe("no console errors", () => {
  for (const mode of ["guest", "host"] as const) {
    test(`${mode} flow loads clean`, async () => {
      const page = await open(base, { mode });
      await page.waitForTimeout(300);
      const errs = (page as unknown as { jsErrors: string[] }).jsErrors;
      expect(errs).toEqual([]);
      await page.close();
    });
  }
});
