import { isValidCountryCode } from "./countries.ts";
import { isValidDocumentType } from "./document-types.ts";
import type { Tourist, TouristValidation, ValidationError } from "./types.ts";

const REQUIRED_FIELDS: ReadonlyArray<keyof Tourist> = [
  "id",
  "facility",
  "stayFrom",
  "timeStayFrom",
  "foreseenStayUntil",
  "timeEstimatedStayUntil",
  "documentType",
  "documentNumber",
  "touristName",
  "touristSurname",
  "gender",
  "dateOfBirth",
  "countryOfBirth",
  "cityOfBirth",
  "citizenship",
  "countryOfResidence",
  "cityOfResidence",
  "ttPaymentCategory",
  "arrivalOrganisation",
];

const COUNTRY_FIELDS: ReadonlyArray<keyof Tourist> = [
  "countryOfBirth",
  "citizenship",
  "countryOfResidence",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function validateTourist(t: Tourist): TouristValidation {
  const errors: ValidationError[] = [];
  const push = (field: keyof Tourist, message: string) =>
    errors.push({ field, message });

  for (const field of REQUIRED_FIELDS) {
    if (!t[field]) push(field, "Required");
  }

  for (const field of COUNTRY_FIELDS) {
    const code = t[field];
    if (code && !isValidCountryCode(code)) {
      push(field, "Use an ISO 3166-1 alpha-3 code");
    }
  }

  if (t.documentType && !isValidDocumentType(t.documentType)) {
    push("documentType", "Unknown document type");
  }

  if (t.stayFrom && !ISO_DATE_RE.test(t.stayFrom)) {
    push("stayFrom", "Invalid date");
  }
  if (t.foreseenStayUntil && !ISO_DATE_RE.test(t.foreseenStayUntil)) {
    push("foreseenStayUntil", "Invalid date");
  }
  if (t.dateOfBirth && !ISO_DATE_RE.test(t.dateOfBirth)) {
    push("dateOfBirth", "Invalid date");
  }
  if (t.passageDate && !ISO_DATE_RE.test(t.passageDate)) {
    push("passageDate", "Invalid date");
  }

  if (t.timeStayFrom && !TIME_RE.test(t.timeStayFrom)) {
    push("timeStayFrom", "Invalid time");
  }
  if (t.timeEstimatedStayUntil && !TIME_RE.test(t.timeEstimatedStayUntil)) {
    push("timeEstimatedStayUntil", "Invalid time");
  }

  if (
    t.stayFrom &&
    t.foreseenStayUntil &&
    ISO_DATE_RE.test(t.stayFrom) &&
    ISO_DATE_RE.test(t.foreseenStayUntil) &&
    t.foreseenStayUntil < t.stayFrom
  ) {
    push("foreseenStayUntil", "Departure must be on or after arrival");
  }

  if (t.dateOfBirth && ISO_DATE_RE.test(t.dateOfBirth)) {
    const today = new Date().toISOString().slice(0, 10);
    if (t.dateOfBirth > today) push("dateOfBirth", "Cannot be in the future");
  }

  if (t.touristEmail && !EMAIL_RE.test(t.touristEmail)) {
    push("touristEmail", "Invalid email");
  }

  return { ok: errors.length === 0, errors };
}
