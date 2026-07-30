import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { open, startHarness, stopHarness } from "./harness.ts";

let base = "";
beforeAll(async () => {
  base = await startHarness();
});
afterAll(stopHarness);

const TMP = "/tmp/evisitor-e2e-guest.xml";

describe("guest to host round trip", () => {
  test("a guest file imports into the host flow", async () => {
    const guest = await open(base, { mode: "guest" });
    for (const [name, value] of [
      ["touristName", "Anna"],
      ["touristSurname", "Kowalski"],
      ["dateOfBirth", "19900415"],
      ["cityOfBirth", "Krakow"],
      ["cityOfResidence", "Warsaw"],
      ["documentNumber", "AB1234567"],
    ] as const) {
      await guest.fill(`input[name="${name}"]`, value);
    }
    for (const name of ["citizenship", "countryOfBirth", "countryOfResidence"] as const) {
      await guest.fill(`input[name="${name}"]`, "Poland");
      await guest.dispatchEvent(`input[name="${name}"]`, "change");
    }
    await guest.click('.gender-pill[data-gender="F"]');
    await guest.waitForTimeout(300);

    const xml = await guest.evaluate(
      () => document.getElementById("guest-xml-preview")?.textContent ?? "",
    );
    expect(xml).toContain("Kowalski");
    expect(xml).toContain("19900415");
    await Bun.write(TMP, xml);
    await guest.close();

    const host = await open(base, { mode: "host" });
    await host.setInputFiles("#import-input", TMP);
    await host.waitForTimeout(600);
    const imported = await host.evaluate(() => ({
      cards: document.getElementById("tourist-list")?.children.length ?? 0,
      name: (document.querySelector('#tourist-list input[name="touristName"]') as HTMLInputElement)?.value,
      surname: (document.querySelector('#tourist-list input[name="touristSurname"]') as HTMLInputElement)?.value,
    }));
    expect(imported.cards).toBe(1);
    expect(imported.name).toBe("Anna");
    expect(imported.surname).toBe("Kowalski");
    await host.close();
  });
});

describe("imported files are untrusted", () => {
  // Regression for the stored XSS: an <ID> carrying an attribute breakout used
  // to reach the markup that builds DOM ids, putting live event handlers on
  // every field in the card.
  test("a crafted <ID> cannot inject attributes", async () => {
    const evil = "/tmp/evisitor-e2e-evil.xml";
    await Bun.write(
      evil,
      `<?xml version="1.0" encoding="UTF-8"?>
<TouristCheckIns>
  <TouristCheckIn>
    <ID>x" autofocus onfocus="window.__pwned=1" data-x="</ID>
    <TouristName>Jane</TouristName>
    <TouristSurname>Doe</TouristSurname>
  </TouristCheckIn>
</TouristCheckIns>`,
    );

    const page = await open(base, { mode: "host" });
    await page.setInputFiles("#import-input", evil);
    await page.waitForTimeout(600);

    const res = await page.evaluate(() => ({
      cards: document.getElementById("tourist-list")?.children.length ?? 0,
      onfocus: document.querySelectorAll("[onfocus]").length,
      autofocus: document.querySelectorAll("[autofocus]").length,
      dataX: document.querySelectorAll("[data-x]").length,
      pwned: (window as unknown as { __pwned?: number }).__pwned ?? 0,
    }));

    // The row still imports; it just cannot carry the payload into the markup.
    expect(res.cards).toBe(1);
    expect(res.onfocus).toBe(0);
    expect(res.autofocus).toBe(0);
    expect(res.dataX).toBe(0);
    expect(res.pwned).toBe(0);
    await page.close();
  });

  test("a file that is not a guest file is rejected with a message", async () => {
    const junk = "/tmp/evisitor-e2e-junk.xml";
    await Bun.write(junk, `<?xml version="1.0"?><SomethingElse><Nope/></SomethingElse>`);
    const page = await open(base, { mode: "host" });
    await page.setInputFiles("#import-input", junk);
    await page.waitForTimeout(500);
    const status = await page.evaluate(
      () => document.getElementById("import-status")?.textContent?.trim() ?? "",
    );
    expect(status.length).toBeGreaterThan(0);
    await page.close();
  });
});

describe("mode switching", () => {
  test("the toggle moves between flows and marks the active one", async () => {
    const page = await open(base, { mode: "host" });
    await page.click('.mode-toggle-btn[data-mode="guest"]');
    await page.waitForSelector("#guest-flow:not([hidden])");
    const state = await page.evaluate(() => ({
      guestHidden: (document.getElementById("guest-flow") as HTMLElement).hidden,
      hostHidden: (document.getElementById("host-flow") as HTMLElement).hidden,
      pressed: document
        .querySelector('.mode-toggle-btn[data-mode="guest"]')!
        .getAttribute("aria-pressed"),
    }));
    expect(state.guestHidden).toBe(false);
    expect(state.hostHidden).toBe(true);
    expect(state.pressed).toBe("true");
    await page.close();
  });
});
