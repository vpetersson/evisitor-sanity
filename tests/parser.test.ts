import { describe, expect, it } from "bun:test";
import { ImportError, parseTouristsXml } from "../src/parser.ts";
import { serialiseImportTourists } from "../src/xml.ts";
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
    residenceAddress: "742 Evergreen Terrace",
    touristEmail: "jane@example.com",
    touristTelephone: "+1 555 010 0100",
    borderCrossing: "",
    passageDate: "",
    ttPaymentCategory: "Standard",
    arrivalOrganisation: "PUI",
    touristAgency: "",
    offeredServiceType: "",
    ...overrides,
  };
}

describe("parseTouristsXml", () => {
  it("round-trips a single tourist through serialise + parse", () => {
    const original = makeTourist();
    const xml = serialiseImportTourists([original]);
    const [parsed] = parseTouristsXml(xml);
    expect(parsed).toBeDefined();
    expect(parsed!.id).toBe(original.id);
    expect(parsed!.touristName).toBe(original.touristName);
    expect(parsed!.touristSurname).toBe(original.touristSurname);
    expect(parsed!.stayFrom).toBe("2026-06-01");
    expect(parsed!.foreseenStayUntil).toBe("2026-06-07");
    expect(parsed!.dateOfBirth).toBe("1990-04-15");
    expect(parsed!.timeStayFrom).toBe("15:00");
    expect(parsed!.gender).toBe("F");
    expect(parsed!.citizenship).toBe("USA");
    expect(parsed!.documentType).toBe("Passport");
    expect(parsed!.facility).toBe("FAC-123");
  });

  it("round-trips multiple tourists in order", () => {
    const a = makeTourist({ id: "id-a", touristName: "Alex" });
    const b = makeTourist({ id: "id-b", touristName: "Bea" });
    const xml = serialiseImportTourists([a, b]);
    const parsed = parseTouristsXml(xml);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.touristName).toBe("Alex");
    expect(parsed[1]!.touristName).toBe("Bea");
  });

  it("recovers escaped characters in field values", () => {
    const xml = serialiseImportTourists([
      makeTourist({ touristSurname: `O'Reilly & "Sons"` }),
    ]);
    const [parsed] = parseTouristsXml(xml);
    expect(parsed!.touristSurname).toBe(`O'Reilly & "Sons"`);
  });

  it("leaves host-only fields empty when the guest file omitted them", () => {
    const guestOnly = makeTourist({
      facility: "",
      ttPaymentCategory: "",
      arrivalOrganisation: "",
    });
    const xml = serialiseImportTourists([guestOnly]);
    const [parsed] = parseTouristsXml(xml);
    expect(parsed!.facility).toBe("");
    expect(parsed!.ttPaymentCategory).toBe("");
    expect(parsed!.arrivalOrganisation).toBe("");
    // Identity fields survived
    expect(parsed!.touristName).toBe("Jane");
  });

  it("assigns a fresh UUID if the source had no ID", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TouristCheckIns>
  <TouristCheckIn>
    <TouristName>Anon</TouristName>
    <TouristSurname>Ymous</TouristSurname>
  </TouristCheckIn>
</TouristCheckIns>`;
    const [parsed] = parseTouristsXml(xml);
    expect(parsed!.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("throws ImportError on completely invalid XML", () => {
    expect(() => parseTouristsXml("not xml at all <<<>>")).toThrow(ImportError);
  });

  it("throws ImportError when there are no TouristCheckIn nodes", () => {
    const xml = `<?xml version="1.0"?><Wrong><Item/></Wrong>`;
    expect(() => parseTouristsXml(xml)).toThrow(ImportError);
  });
});
