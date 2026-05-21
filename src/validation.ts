import { isValidCountryCode } from "./countries.ts";
import { isValidDocumentType } from "./document-types.ts";
import type { Mode, Tourist, TouristValidation, ValidationError } from "./types.ts";

const HOST_REQUIRED_FIELDS: ReadonlyArray<keyof Tourist> = [
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

// Guests don't know property-, tax-, or arrival-related fields. The host
// fills those in after importing the guest's file.
const GUEST_REQUIRED_FIELDS: ReadonlyArray<keyof Tourist> = [
  "id",
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
];

const COUNTRY_FIELDS: ReadonlyArray<keyof Tourist> = [
  "countryOfBirth",
  "citizenship",
  "countryOfResidence",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function validateTourist(
  t: Tourist,
  mode: Mode = "host",
): TouristValidation {
  const errors: ValidationError[] = [];
  const push = (field: keyof Tourist, message: string) =>
    errors.push({ field, message });

  const required = mode === "guest" ? GUEST_REQUIRED_FIELDS : HOST_REQUIRED_FIELDS;
  for (const field of required) {
    if (!t[field]) push(field, "Please fill this in.");
  }

  for (const field of COUNTRY_FIELDS) {
    const code = t[field];
    if (code && !isValidCountryCode(code)) {
      push(field, "Please pick a country from the list.");
    }
  }

  if (t.documentType && !isValidDocumentType(t.documentType)) {
    push("documentType", "Please pick a document type.");
  }

  if (t.stayFrom && !ISO_DATE_RE.test(t.stayFrom)) {
    push("stayFrom", "Please enter a valid date.");
  }
  if (t.foreseenStayUntil && !ISO_DATE_RE.test(t.foreseenStayUntil)) {
    push("foreseenStayUntil", "Please enter a valid date.");
  }
  if (t.dateOfBirth && !ISO_DATE_RE.test(t.dateOfBirth)) {
    push("dateOfBirth", "Please enter a valid date.");
  }
  if (t.passageDate && !ISO_DATE_RE.test(t.passageDate)) {
    push("passageDate", "Please enter a valid date.");
  }

  if (t.timeStayFrom && !TIME_RE.test(t.timeStayFrom)) {
    push("timeStayFrom", "Please enter a valid time.");
  }
  if (t.timeEstimatedStayUntil && !TIME_RE.test(t.timeEstimatedStayUntil)) {
    push("timeEstimatedStayUntil", "Please enter a valid time.");
  }

  if (
    t.stayFrom &&
    t.foreseenStayUntil &&
    ISO_DATE_RE.test(t.stayFrom) &&
    ISO_DATE_RE.test(t.foreseenStayUntil) &&
    t.foreseenStayUntil < t.stayFrom
  ) {
    push("foreseenStayUntil", "Check-out should be on or after check-in.");
  }

  if (t.dateOfBirth && ISO_DATE_RE.test(t.dateOfBirth)) {
    const today = new Date().toISOString().slice(0, 10);
    if (t.dateOfBirth > today) push("dateOfBirth", "Date of birth can't be in the future.");
  }

  if (t.touristEmail && !EMAIL_RE.test(t.touristEmail)) {
    push("touristEmail", "That doesn't look like a valid email.");
  }

  return { ok: errors.length === 0, errors };
}
