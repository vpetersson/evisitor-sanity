import { describe, expect, test } from "bun:test";
import { coerceId, isSafeId, newId } from "../src/ids.ts";
import { parseTouristsXml } from "../src/parser.ts";

// An imported file's <ID> is attacker-controlled and is used to build DOM ids
// (`t-${id}-${field}`), which are interpolated into markup. A crafted <ID> once
// broke out of the attribute and added live event handlers to every field on
// the page — confirmed in a real browser, 125 elements and the handler firing.
const ATTR_BREAKOUT = `x" autofocus onfocus="window.__pwned=1" data-x="`;

function fileWithId(id: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TouristCheckIns>
  <TouristCheckIn>
    <ID>${id}</ID>
    <TouristName>Jane</TouristName>
    <TouristSurname>Doe</TouristSurname>
  </TouristCheckIn>
</TouristCheckIns>`;
}

describe("id sanitising", () => {
  test("accepts identifiers this app generates", () => {
    expect(isSafeId(newId())).toBe(true);
    expect(isSafeId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isSafeId("12345")).toBe(true);
  });

  test("rejects anything that could break out of an attribute", () => {
    expect(isSafeId(ATTR_BREAKOUT)).toBe(false);
    expect(isSafeId('a" onfocus="x')).toBe(false);
    expect(isSafeId("a b")).toBe(false); // spaces are also invalid HTML ids
    expect(isSafeId("<script>")).toBe(false);
    expect(isSafeId("")).toBe(false);
    expect(isSafeId("x".repeat(65))).toBe(false);
  });

  test("coerceId keeps good ids and replaces bad ones", () => {
    expect(coerceId("550e8400-e29b-41d4-a716-446655440000"))
      .toBe("550e8400-e29b-41d4-a716-446655440000");
    const replaced = coerceId(ATTR_BREAKOUT);
    expect(replaced).not.toBe(ATTR_BREAKOUT);
    expect(isSafeId(replaced)).toBe(true);
  });
});

describe("parser hardening", () => {
  test("a malicious <ID> never survives into the tourist row", () => {
    const [t] = parseTouristsXml(fileWithId(ATTR_BREAKOUT));
    expect(t!.id).not.toContain("onfocus");
    expect(t!.id).not.toContain('"');
    expect(isSafeId(t!.id)).toBe(true);
  });

  test("a legitimate <ID> is preserved", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const [t] = parseTouristsXml(fileWithId(uuid));
    expect(t!.id).toBe(uuid);
  });

  test("a missing <ID> still gets one", () => {
    const [t] = parseTouristsXml(`<?xml version="1.0"?>
<TouristCheckIns><TouristCheckIn><TouristName>Jane</TouristName></TouristCheckIn></TouristCheckIns>`);
    expect(isSafeId(t!.id)).toBe(true);
  });
});
