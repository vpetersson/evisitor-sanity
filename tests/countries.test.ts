import { describe, expect, it } from "bun:test";
import { COUNTRIES, countryName, isValidCountryCode } from "../src/countries.ts";

describe("countries", () => {
  it("includes Croatia, the United States, and Germany", () => {
    expect(isValidCountryCode("HRV")).toBe(true);
    expect(isValidCountryCode("USA")).toBe(true);
    expect(isValidCountryCode("DEU")).toBe(true);
  });

  it("rejects unknown codes", () => {
    expect(isValidCountryCode("XYZ")).toBe(false);
    expect(isValidCountryCode("")).toBe(false);
    expect(isValidCountryCode("hrv")).toBe(false);
  });

  it("uses three-letter alpha-3 codes throughout", () => {
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("has unique codes", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("covers a reasonable share of ISO 3166-1", () => {
    expect(COUNTRIES.length).toBeGreaterThan(200);
  });

  it("looks up country names", () => {
    expect(countryName("HRV")).toBe("Croatia");
    expect(countryName("XYZ")).toBeUndefined();
  });
});
