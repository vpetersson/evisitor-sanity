import { describe, expect, it } from "bun:test";
import {
  serialiseImportTourists,
  toEvisitorDate,
  toEvisitorTime,
  xmlEscape,
} from "../src/xml.ts";
import type { Tourist } from "../src/types.ts";

function makeTourist(overrides: Partial<Tourist> = {}): Tourist {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    facility: "FAC-123",
    stayFrom: "2026-06-01",
    timeStayFrom: "15:00",
    foreseenStayUntil: "2026-06-07",
    timeEstimatedStayUntil: "10:00",
    documentType: "Passport",
    documentNumber: "P1234567",
    touristName: "Jane",
    touristMiddleName: "",
    touristSurname: "Doe",
    gender: "F",
    dateOfBirth: "1990-04-15",
    countryOfBirth: "USA",
    cityOfBirth: "Portland",
    citizenship: "USA",
    countryOfResidence: "USA",
    cityOfResidence: "Portland",
    residenceAddress: "",
    touristEmail: "",
    touristTelephone: "",
    borderCrossing: "",
    passageDate: "",
    ttPaymentCategory: "Standard",
    arrivalOrganisation: "PUI",
    touristAgency: "",
    offeredServiceType: "",
    ...overrides,
  };
}

describe("xmlEscape", () => {
  it("escapes the five reserved characters", () => {
    expect(xmlEscape(`A & B <c> "d" 'e'`)).toBe(
      `A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;`,
    );
  });

  it("returns the same string when nothing to escape", () => {
    expect(xmlEscape("plain text 123")).toBe("plain text 123");
  });
});

describe("toEvisitorDate", () => {
  it("converts YYYY-MM-DD to YYYYMMDD", () => {
    expect(toEvisitorDate("2026-06-01")).toBe("20260601");
  });

  it("returns empty for empty input", () => {
    expect(toEvisitorDate("")).toBe("");
  });

  it("passes through non-ISO values unchanged", () => {
    expect(toEvisitorDate("20260601")).toBe("20260601");
  });
});

describe("toEvisitorTime", () => {
  it("keeps hh:mm format", () => {
    expect(toEvisitorTime("15:00")).toBe("15:00");
  });

  it("drops seconds if present", () => {
    expect(toEvisitorTime("15:00:30")).toBe("15:00");
  });

  it("handles empty input", () => {
    expect(toEvisitorTime("")).toBe("");
  });
});

describe("serialiseImportTourists", () => {
  it("starts with the XML declaration and wraps in TouristCheckIns", () => {
    const xml = serialiseImportTourists([makeTourist()]);
    expect(xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>\n<TouristCheckIns>`))
      .toBe(true);
    expect(xml.trimEnd().endsWith("</TouristCheckIns>")).toBe(true);
  });

  it("emits required fields in YYYYMMDD/hh:mm format", () => {
    const xml = serialiseImportTourists([makeTourist()]);
    expect(xml).toContain("<StayFrom>20260601</StayFrom>");
    expect(xml).toContain("<TimeStayFrom>15:00</TimeStayFrom>");
    expect(xml).toContain("<ForeseenStayUntil>20260607</ForeseenStayUntil>");
    expect(xml).toContain("<DateOfBirth>19900415</DateOfBirth>");
    expect(xml).toContain("<Gender>F</Gender>");
    expect(xml).toContain("<Citizenship>USA</Citizenship>");
  });

  it("omits optional fields that are empty", () => {
    const xml = serialiseImportTourists([makeTourist()]);
    expect(xml).not.toContain("TouristMiddleName");
    expect(xml).not.toContain("ResidenceAddress");
    expect(xml).not.toContain("TouristEmail");
    expect(xml).not.toContain("TouristTelephone");
    expect(xml).not.toContain("BorderCrossing");
    expect(xml).not.toContain("PassageDate");
    expect(xml).not.toContain("TouristAgency");
    expect(xml).not.toContain("OfferedServiceType");
  });

  it("includes optional fields when present", () => {
    const xml = serialiseImportTourists([
      makeTourist({
        touristMiddleName: "Q.",
        touristEmail: "jane@example.com",
        residenceAddress: "742 Evergreen Terrace",
      }),
    ]);
    expect(xml).toContain("<TouristMiddleName>Q.</TouristMiddleName>");
    expect(xml).toContain("<TouristEmail>jane@example.com</TouristEmail>");
    expect(xml).toContain(
      "<ResidenceAddress>742 Evergreen Terrace</ResidenceAddress>",
    );
  });

  it("escapes XML-reserved characters in field values", () => {
    const xml = serialiseImportTourists([
      makeTourist({ touristSurname: `O'Reilly & "Sons"` }),
    ]);
    expect(xml).toContain(
      `<TouristSurname>O&apos;Reilly &amp; &quot;Sons&quot;</TouristSurname>`,
    );
  });

  it("serialises multiple tourists in order", () => {
    const xml = serialiseImportTourists([
      makeTourist({ id: "id-a", touristName: "A" }),
      makeTourist({ id: "id-b", touristName: "B" }),
    ]);
    const opens = xml.match(/<TouristCheckIn>/g) ?? [];
    expect(opens.length).toBe(2);
    const idxA = xml.indexOf("<TouristName>A</TouristName>");
    const idxB = xml.indexOf("<TouristName>B</TouristName>");
    expect(idxA).toBeGreaterThan(-1);
    expect(idxB).toBeGreaterThan(idxA);
  });
});
