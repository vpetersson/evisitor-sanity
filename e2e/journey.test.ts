import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { open, startHarness, stopHarness } from "./harness.ts";
import type { Page } from "playwright";

/**
 * The whole job, done the way a person actually does it.
 *
 * A guest fills in their details by typing and clicking, watches the form tell
 * them what is still missing, and saves a file. Their host then imports that
 * file, adds the parts only a host knows, and saves the file they will upload
 * to eVisitor. Nothing here reaches into app internals: it clicks what a person
 * clicks and reads what a person reads.
 */

let base = "";
beforeAll(async () => {
  base = await startHarness();
});
afterAll(stopHarness);

/** Type into a field the way a person does, so input handlers fire per key. */
async function type(page: Page, name: string, value: string): Promise<void> {
  const sel = `input[name="${name}"]`;
  await page.click(sel);
  await page.fill(sel, "");
  await page.type(sel, value, { delay: 8 });
}

/** A country combobox stores an ISO code but shows a name; commit with a blur. */
async function pickCountry(page: Page, name: string, country: string): Promise<void> {
  await type(page, name, country);
  await page.dispatchEvent(`input[name="${name}"]`, "change");
  await page.keyboard.press("Tab");
}

const visibleText = (page: Page, sel: string) =>
  page.evaluate((s) => document.querySelector(s)?.textContent?.trim() ?? "", sel);

describe("a guest fills in their details and sends a file to their host", () => {
  test("the full round trip produces an uploadable file", async () => {
    /* ─── The guest ─────────────────────────────────────────────── */
    const guest = await open(base, { width: 1280, height: 1000 });

    // Lands on the chooser and picks their role.
    expect(await guest.isVisible("#mode-chooser")).toBe(true);
    await guest.click('[data-pick-mode="guest"]');
    await guest.waitForSelector("#guest-flow:not([hidden])");

    // Before typing anything, the form should be telling them work remains.
    const startingStatus = await visibleText(guest, "#sticky-status");
    expect(startingStatus).toMatch(/fill in/i);

    // They fill it in.
    await type(guest, "touristName", "Anna");
    await type(guest, "touristSurname", "Kowalski");
    await guest.click('.gender-pill[data-gender="F"]');
    await type(guest, "dateOfBirth", "19900415");
    await pickCountry(guest, "citizenship", "Poland");
    await pickCountry(guest, "countryOfBirth", "Poland");
    await type(guest, "cityOfBirth", "Krakow");
    await pickCountry(guest, "countryOfResidence", "Poland");
    await type(guest, "cityOfResidence", "Warsaw");
    await type(guest, "documentNumber", "AB1234567");
    // The guest owns their own arrival and departure dates too.
    await guest.fill('input[name="stayFrom"]', "2026-08-01");
    await guest.fill('input[name="foreseenStayUntil"]', "2026-08-08");
    await guest.keyboard.press("Tab");
    await guest.waitForTimeout(400);

    // The card header now shows who this is, and the sex they picked is lit up.
    expect(await visibleText(guest, ".guest-name")).toBe("Anna Kowalski");
    expect(
      await guest.getAttribute('.gender-pill[data-gender="F"]', "aria-pressed"),
    ).toBe("true");

    // And the form says it is satisfied.
    const readyChip = await visibleText(guest, ".guest-chip-slot");
    expect(readyChip).toMatch(/looks good/i);

    // They save the file.
    const download = await Promise.all([
      guest.waitForEvent("download"),
      guest.click("#btn-guest-download"),
    ]).then(([d]) => d);
    const guestFile = "/tmp/evisitor-journey-guest.xml";
    await download.saveAs(guestFile);
    expect(download.suggestedFilename()).toMatch(/\.xml$/);

    const sent = await Bun.file(guestFile).text();
    expect(sent).toContain("<TouristCheckIns>");
    expect(sent).toContain("<TouristSurname>Kowalski</TouristSurname>");
    expect(sent).toContain("<Gender>F</Gender>");
    expect(sent).toContain("<DateOfBirth>19900415</DateOfBirth>");
    await guest.close();

    /* ─── Their host ────────────────────────────────────────────── */
    const host = await open(base, { width: 1280, height: 1000 });
    await host.click('[data-pick-mode="host"]');
    await host.waitForSelector("#host-flow:not([hidden])");

    // Sets up the property once.
    await host.click('input[name="facility"]');
    await host.type('input[name="facility"]', "12345-67", { delay: 8 });
    await host.click('input[name="defaultArrivalOrg"]');
    await host.type('input[name="defaultArrivalOrg"]', "00", { delay: 8 });
    await host.waitForTimeout(300);

    // Imports what the guest sent.
    await host.setInputFiles("#import-input", guestFile);
    await host.waitForTimeout(700);

    const importMsg = await visibleText(host, "#import-status");
    expect(importMsg).toMatch(/imported 1 guest/i);
    expect(await visibleText(host, ".guest-name")).toBe("Anna Kowalski");

    // The guest could not know these, so the host supplies them.
    await host.selectOption('select[name="ttPaymentCategory"]', { index: 1 }).catch(async () => {
      await type(host, "ttPaymentCategory", "Standard");
    });
    await host.waitForTimeout(200);
    const stayFrom = await host.$('input[name="stayFrom"]');
    if (stayFrom) {
      await host.fill('input[name="stayFrom"]', "2026-08-01");
      await host.fill('input[name="foreseenStayUntil"]', "2026-08-08");
    }
    await host.waitForTimeout(500);

    // Saves the file they will upload to eVisitor.
    const finalDl = await Promise.all([
      host.waitForEvent("download"),
      host.click("#btn-download"),
    ]).then(([d]) => d);
    const hostFile = "/tmp/evisitor-journey-host.xml";
    await finalDl.saveAs(hostFile);

    const final = await Bun.file(hostFile).text();
    expect(final).toContain("<TouristSurname>Kowalski</TouristSurname>");
    expect(final).toContain("<Facility>12345-67</Facility>");
    expect(final).toContain("<Gender>F</Gender>");

    // It has to be well-formed, or eVisitor will simply refuse it.
    const parsed = await host.evaluate((xml) => {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      return {
        error: !!doc.getElementsByTagName("parsererror")[0],
        rows: doc.getElementsByTagName("TouristCheckIn").length,
        root: doc.documentElement.tagName,
      };
    }, final);
    expect(parsed.error).toBe(false);
    expect(parsed.rows).toBe(1);
    expect(parsed.root).toBe("TouristCheckIns");

    await host.close();
  }, 90_000);
});

describe("a guest who leaves things blank is told what is missing", () => {
  test("saving early points at the gaps instead of producing a file", async () => {
    const page = await open(base, { mode: "guest", width: 1280 });
    await page.click("#btn-guest-download");
    await page.waitForTimeout(500);

    const errors = await page.evaluate(
      () =>
        [...document.querySelectorAll(".field-error")]
          .filter((e) => !(e as HTMLElement).hidden)
          .map((e) => e.textContent?.trim() ?? ""),
    );
    expect(errors.length).toBeGreaterThan(5);

    // Every required control is marked, including the sex pills.
    const marked = await page.evaluate(() => ({
      invalidControls: document.querySelectorAll('[aria-invalid="true"]').length,
      genderInvalid: document.querySelector(".gender-group")?.getAttribute("aria-invalid"),
    }));
    expect(marked.invalidControls).toBeGreaterThan(5);
    expect(marked.genderInvalid).toBe("true");

    // Filling one field clears exactly that message and nothing else.
    const before = errors.length;
    await type(page, "touristName", "Anna");
    await page.waitForTimeout(400);
    const after = await page.evaluate(
      () => [...document.querySelectorAll(".field-error")].filter((e) => !(e as HTMLElement).hidden).length,
    );
    expect(after).toBe(before - 1);
    await page.close();
  }, 60_000);
});
