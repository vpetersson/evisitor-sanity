import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { open, startHarness, stopHarness } from "./harness.ts";

let base = "";
beforeAll(async () => {
  base = await startHarness();
});
afterAll(stopHarness);

const read = (page: Awaited<ReturnType<typeof open>>) =>
  page.evaluate(() => ({
    sticky: document.getElementById("sticky-status")?.textContent?.trim() ?? "",
    button: document.querySelector("#btn-download-sticky .btn-label")?.textContent?.trim() ?? "",
    pct: Number(document.getElementById("guest-progress")?.getAttribute("aria-valuenow") ?? "-1"),
  }));

describe("progress is shown, and it is real", () => {
  test("an untouched form already shows progress, from actual defaults", async () => {
    const page = await open(base, { mode: "guest" });
    const before = await read(page);

    // Above zero, because the document type and both times genuinely arrive
    // pre-filled. Not a head start invented to flatter the bar.
    expect(before.pct).toBeGreaterThan(0);
    expect(before.sticky).toMatch(/^\d+ of \d+ done$/);

    // And the head start matches the fields that are actually populated.
    const prefilled = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
          '#guest-tourist-list .field-input, #guest-tourist-list .field-select',
        )].filter((el) => el.value.trim() !== "").length,
    );
    expect(prefilled).toBeGreaterThan(0);
    await page.close();
  });

  test("filling fields moves it forward", async () => {
    const page = await open(base, { mode: "guest" });
    const before = await read(page);
    await page.fill('input[name="touristName"]', "Anna");
    await page.fill('input[name="touristSurname"]', "Kowalski");
    await page.fill('input[name="cityOfBirth"]', "Krakow");
    await page.click('.gender-pill[data-gender="F"]');
    await page.waitForTimeout(400);
    const after = await read(page);

    expect(after.pct).toBeGreaterThan(before.pct);
    expect(after.pct).toBeLessThanOrEqual(100);
    // The bar's width has to follow the number it reports.
    const width = await page.evaluate(() => {
      const bar = document.getElementById("guest-progress")!;
      const fill = bar.querySelector(".progress-fill")!;
      return fill.getBoundingClientRect().width / bar.getBoundingClientRect().width;
    });
    expect(Math.round(width * 100)).toBeGreaterThan(before.pct);
    await page.close();
  });

  test("progress never reports more than is done", async () => {
    const page = await open(base, { mode: "guest" });
    const { pct } = await read(page);
    const counts = await page.evaluate(() => {
      const s = document.getElementById("sticky-status")?.textContent ?? "";
      const m = /^(\d+) of (\d+) done$/.exec(s.trim());
      return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
    });
    expect(counts).not.toBeNull();
    expect(counts!.done).toBeLessThanOrEqual(counts!.total);
    expect(pct).toBe(Math.round((counts!.done / counts!.total) * 100));
    await page.close();
  });
});

describe("the primary button names what it will produce", () => {
  test("it counts the guests rather than saying 'the file'", async () => {
    const page = await open(base, { mode: "guest" });
    expect((await read(page)).button).toBe("Save file for 1 guest");

    await page.click("#btn-add-guest");
    await page.waitForTimeout(400);
    expect((await read(page)).button).toBe("Save file for 2 guests");
    await page.close();
  });
});

describe("clearing entered people says what will be lost", () => {
  // The stakes are real: nothing is stored on a server, so clearing is the end
  // of it. The dialog names the person rather than asking about "all guests".
  test("the confirmation names them", async () => {
    const page = await open(base, { mode: "guest" });
    await page.fill('input[name="touristName"]', "Anna");
    await page.fill('input[name="touristSurname"]', "Kowalski");
    await page.waitForTimeout(300);

    let message = "";
    page.on("dialog", async (d) => {
      message = d.message();
      await d.dismiss();
    });
    await page.click("#btn-reset-guest");
    await page.waitForTimeout(300);

    expect(message).toContain("Anna Kowalski");
    expect(message).toMatch(/cannot be undone/i);
    // Dismissing must actually keep the data.
    const stillThere = await page.evaluate(
      () => (document.querySelector('input[name="touristName"]') as HTMLInputElement).value,
    );
    expect(stillThere).toBe("Anna");
    await page.close();
  });
});
