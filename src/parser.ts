import type { Gender, Tourist } from "./types.ts";

export class ImportError extends Error {}

const TAG_TO_FIELD: Record<string, keyof Tourist> = {
  ID: "id",
  Facility: "facility",
  StayFrom: "stayFrom",
  TimeStayFrom: "timeStayFrom",
  ForeseenStayUntil: "foreseenStayUntil",
  TimeEstimatedStayUntil: "timeEstimatedStayUntil",
  DocumentType: "documentType",
  DocumentNumber: "documentNumber",
  TouristName: "touristName",
  TouristMiddleName: "touristMiddleName",
  TouristSurname: "touristSurname",
  Gender: "gender",
  DateOfBirth: "dateOfBirth",
  CountryOfBirth: "countryOfBirth",
  CityOfBirth: "cityOfBirth",
  Citizenship: "citizenship",
  CountryOfResidence: "countryOfResidence",
  CityOfResidence: "cityOfResidence",
  ResidenceAddress: "residenceAddress",
  TouristEmail: "touristEmail",
  TouristTelephone: "touristTelephone",
  BorderCrossing: "borderCrossing",
  PassageDate: "passageDate",
  TTPaymentCategory: "ttPaymentCategory",
  ArrivalOrganisation: "arrivalOrganisation",
  TouristAgency: "touristAgency",
  OfferedServiceType: "offeredServiceType",
};

const DATE_FIELDS: ReadonlySet<keyof Tourist> = new Set([
  "stayFrom",
  "foreseenStayUntil",
  "dateOfBirth",
  "passageDate",
]);

function emptyTourist(): Tourist {
  return {
    id: "",
    facility: "",
    stayFrom: "",
    timeStayFrom: "",
    foreseenStayUntil: "",
    timeEstimatedStayUntil: "",
    documentType: "",
    documentNumber: "",
    touristName: "",
    touristMiddleName: "",
    touristSurname: "",
    gender: "",
    dateOfBirth: "",
    countryOfBirth: "",
    cityOfBirth: "",
    citizenship: "",
    countryOfResidence: "",
    cityOfResidence: "",
    residenceAddress: "",
    touristEmail: "",
    touristTelephone: "",
    borderCrossing: "",
    passageDate: "",
    ttPaymentCategory: "",
    arrivalOrganisation: "",
    touristAgency: "",
    offeredServiceType: "",
  };
}

function fromEvisitorDate(raw: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw.trim());
  if (!m) return raw;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function readTourist(node: Element): Tourist {
  const out = emptyTourist();
  for (const child of Array.from(node.children)) {
    const field = TAG_TO_FIELD[child.tagName];
    if (!field) continue;
    const raw = (child.textContent ?? "").trim();
    if (!raw) continue;
    if (field === "gender") {
      out.gender = raw === "M" || raw === "F" ? (raw as Gender) : "";
    } else if (DATE_FIELDS.has(field)) {
      (out as unknown as Record<string, string>)[field] = fromEvisitorDate(raw);
    } else {
      (out as unknown as Record<string, string>)[field] = raw;
    }
  }
  if (!out.id) out.id = newId();
  return out;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function parseTouristsXml(xml: string): Tourist[] {
  if (typeof DOMParser === "undefined") {
    throw new ImportError("File import isn't supported in this environment.");
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) {
    throw new ImportError(
      "We couldn't read that file. Please ask the guest to send a fresh one.",
    );
  }
  const nodes = Array.from(doc.getElementsByTagName("TouristCheckIn"));
  if (nodes.length === 0) {
    throw new ImportError(
      "That file doesn't look like a guest details file. Please double-check what was sent.",
    );
  }
  return nodes.map(readTourist);
}
