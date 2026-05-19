import { describe, expect, it } from "bun:test";
import { validateTourist } from "../src/validation.ts";
import type { Tourist } from "../src/types.ts";

function tourist(overrides: Partial<Tourist> = {}): Tourist {
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

describe("validateTourist", () => {
  it("accepts a complete tourist", () => {
    const v = validateTourist(tourist());
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("flags missing required fields", () => {
    const v = validateTourist(tourist({ touristName: "", facility: "", gender: "" }));
    const fields = v.errors.map((e) => e.field);
    expect(fields).toContain("touristName");
    expect(fields).toContain("facility");
    expect(fields).toContain("gender");
    expect(v.ok).toBe(false);
  });

  it("rejects unknown ISO country codes", () => {
    const v = validateTourist(tourist({ citizenship: "XYZ" }));
    expect(v.errors.some((e) => e.field === "citizenship")).toBe(true);
  });

  it("rejects departure earlier than arrival", () => {
    const v = validateTourist(
      tourist({ stayFrom: "2026-06-07", foreseenStayUntil: "2026-06-01" }),
    );
    expect(v.errors.some((e) => e.field === "foreseenStayUntil")).toBe(true);
  });

  it("rejects a date of birth in the future", () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const iso = future.toISOString().slice(0, 10);
    const v = validateTourist(tourist({ dateOfBirth: iso }));
    expect(v.errors.some((e) => e.field === "dateOfBirth")).toBe(true);
  });

  it("rejects malformed email when provided", () => {
    const v = validateTourist(tourist({ touristEmail: "not-an-email" }));
    expect(v.errors.some((e) => e.field === "touristEmail")).toBe(true);
  });

  it("accepts an empty email (optional field)", () => {
    const v = validateTourist(tourist({ touristEmail: "" }));
    expect(v.errors.some((e) => e.field === "touristEmail")).toBe(false);
  });

  it("rejects an unknown document type", () => {
    const v = validateTourist(tourist({ documentType: "GoldenTicket" }));
    expect(v.errors.some((e) => e.field === "documentType")).toBe(true);
  });
});
