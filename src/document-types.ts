import type { DocumentTypeOption } from "./types.ts";

export const DOCUMENT_TYPES: readonly DocumentTypeOption[] = [
  { code: "Passport", label: "Passport" },
  { code: "IdentityCard", label: "National ID card" },
  { code: "DriverLicense", label: "Driver's license" },
  { code: "OtherDocument", label: "Other" },
];

export const PAYMENT_CATEGORIES: readonly string[] = [
  "Standard",
  "Children under 12 (exempt)",
  "Persons aged 12-18 (50%)",
  "Persons with disability",
  "Other exemption",
];

const codeSet = new Set(DOCUMENT_TYPES.map((d) => d.code));

export function isValidDocumentType(code: string): boolean {
  return codeSet.has(code);
}
