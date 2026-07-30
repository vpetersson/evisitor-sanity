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

/**
 * The date-of-birth field is a masked text input rather than a native date
 * picker, because a picker opens on the current month and a birthday is decades
 * back. The cost is that nothing stops a guest typing a date that does not
 * exist, and the shape check above happily accepted 2026-02-31 and 2026-13-45,
 * which serialise to 20260231 and 20261345 for eVisitor to reject later. Import
 * has the same hole: fromEvisitorDate turns any 8 digits into YYYY-MM-DD.
 */
export function isRealDate(iso: string): boolean {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return false;
  const [y, mo, d] = [Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10))];
  if (mo < 1 || mo > 12 || d < 1) return false;
  // Round-tripping through Date catches month lengths and leap years without a
  // table: JS rolls 2026-02-31 forward to 3 March, so the parts stop matching.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Same problem one field over: the shape check accepted 99:99. */
export function isRealTime(hhmm: string): boolean {
  if (!TIME_RE.test(hhmm)) return false;
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(3, 5));
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

const DATE_FIELDS: ReadonlyArray<keyof Tourist> = [
  "stayFrom",
  "foreseenStayUntil",
  "dateOfBirth",
  "passageDate",
];

const TIME_FIELDS: ReadonlyArray<keyof Tourist> = ["timeStayFrom", "timeEstimatedStayUntil"];

// A guest old enough to predate this is a mistyped year, not a centenarian.
const EARLIEST_BIRTH_YEAR = 1900;

export function validateTourist(
  t: Tourist,
  mode: Mode = "host",
): TouristValidation {
  const errors: ValidationError[] = [];
  const push = (field: keyof Tourist, message: string) =>
    errors.push({ field, message });

  const required = mode === "guest" ? GUEST_REQUIRED_FIELDS : HOST_REQUIRED_FIELDS;
  for (const field of required) {
    // "Required", not a sentence: this fires on every empty field at once, so a
    // full sentence repeated a dozen times down the card is noise that buries the
    // messages that actually say something specific (bad date, bad email).
    if (!t[field]) push(field, "Required");
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

  for (const field of DATE_FIELDS) {
    const value = t[field];
    if (!value) continue;
    // Two different mistakes, so two different messages: a half-typed date is
    // not the same problem as 31 February, and telling someone to "enter a
    // valid date" when they have typed ten sensible-looking digits is useless.
    if (!ISO_DATE_RE.test(value)) push(field, "Use the format YYYY-MM-DD.");
    else if (!isRealDate(value)) push(field, "That date doesn't exist. Check the day and month.");
  }

  for (const field of TIME_FIELDS) {
    const value = t[field];
    if (!value) continue;
    if (!TIME_RE.test(value)) push(field, "Use the format HH:MM.");
    else if (!isRealTime(value)) push(field, "That time doesn't exist. Use a 24-hour clock.");
  }

  if (
    t.stayFrom &&
    t.foreseenStayUntil &&
    isRealDate(t.stayFrom) &&
    isRealDate(t.foreseenStayUntil) &&
    t.foreseenStayUntil < t.stayFrom
  ) {
    push("foreseenStayUntil", "Check-out should be on or after check-in.");
  }

  if (t.dateOfBirth && isRealDate(t.dateOfBirth)) {
    const today = new Date().toISOString().slice(0, 10);
    if (t.dateOfBirth > today) push("dateOfBirth", "Date of birth can't be in the future.");
    else if (Number(t.dateOfBirth.slice(0, 4)) < EARLIEST_BIRTH_YEAR) {
      push("dateOfBirth", "Check the year.");
    }
  }

  if (t.touristEmail && !EMAIL_RE.test(t.touristEmail)) {
    push("touristEmail", "That doesn't look like a valid email.");
  }

  return { ok: errors.length === 0, errors };
}
