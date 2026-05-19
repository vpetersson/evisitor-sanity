import type { Tourist } from "./types.ts";

const REQUIRED_FIELD_ORDER: ReadonlyArray<keyof Tourist> = [
  "id",
  "facility",
  "stayFrom",
  "timeStayFrom",
  "foreseenStayUntil",
  "timeEstimatedStayUntil",
  "documentType",
  "documentNumber",
  "touristName",
  "touristMiddleName",
  "touristSurname",
  "gender",
  "dateOfBirth",
  "countryOfBirth",
  "cityOfBirth",
  "citizenship",
  "countryOfResidence",
  "cityOfResidence",
  "residenceAddress",
  "touristEmail",
  "touristTelephone",
  "borderCrossing",
  "passageDate",
  "ttPaymentCategory",
  "arrivalOrganisation",
  "touristAgency",
  "offeredServiceType",
];

const FIELD_TO_TAG: Record<keyof Tourist, string> = {
  id: "ID",
  facility: "Facility",
  stayFrom: "StayFrom",
  timeStayFrom: "TimeStayFrom",
  foreseenStayUntil: "ForeseenStayUntil",
  timeEstimatedStayUntil: "TimeEstimatedStayUntil",
  documentType: "DocumentType",
  documentNumber: "DocumentNumber",
  touristName: "TouristName",
  touristMiddleName: "TouristMiddleName",
  touristSurname: "TouristSurname",
  gender: "Gender",
  dateOfBirth: "DateOfBirth",
  countryOfBirth: "CountryOfBirth",
  cityOfBirth: "CityOfBirth",
  citizenship: "Citizenship",
  countryOfResidence: "CountryOfResidence",
  cityOfResidence: "CityOfResidence",
  residenceAddress: "ResidenceAddress",
  touristEmail: "TouristEmail",
  touristTelephone: "TouristTelephone",
  borderCrossing: "BorderCrossing",
  passageDate: "PassageDate",
  ttPaymentCategory: "TTPaymentCategory",
  arrivalOrganisation: "ArrivalOrganisation",
  touristAgency: "TouristAgency",
  offeredServiceType: "OfferedServiceType",
};

const DATE_FIELDS: ReadonlySet<keyof Tourist> = new Set([
  "stayFrom",
  "foreseenStayUntil",
  "dateOfBirth",
  "passageDate",
]);

const TIME_FIELDS: ReadonlySet<keyof Tourist> = new Set([
  "timeStayFrom",
  "timeEstimatedStayUntil",
]);

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toEvisitorDate(isoDate: string): string {
  if (!isoDate) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  return `${m[1]}${m[2]}${m[3]}`;
}

export function toEvisitorTime(htmlTime: string): string {
  if (!htmlTime) return "";
  const m = /^(\d{2}):(\d{2})/.exec(htmlTime);
  if (!m) return htmlTime;
  return `${m[1]}:${m[2]}`;
}

function serialiseValue(field: keyof Tourist, raw: string): string {
  if (DATE_FIELDS.has(field)) return toEvisitorDate(raw);
  if (TIME_FIELDS.has(field)) return toEvisitorTime(raw);
  return raw;
}

function serialiseTourist(t: Tourist, indent: string): string {
  const lines: string[] = [`${indent}<TouristCheckIn>`];
  for (const field of REQUIRED_FIELD_ORDER) {
    const raw = t[field];
    const serialised = serialiseValue(field, raw);
    if (!serialised) continue;
    const tag = FIELD_TO_TAG[field];
    lines.push(`${indent}  <${tag}>${xmlEscape(serialised)}</${tag}>`);
  }
  lines.push(`${indent}</TouristCheckIn>`);
  return lines.join("\n");
}

export function serialiseImportTourists(tourists: readonly Tourist[]): string {
  const indent = "  ";
  const body = tourists.map((t) => serialiseTourist(t, indent)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<TouristCheckIns>\n${body}\n</TouristCheckIns>\n`;
}
