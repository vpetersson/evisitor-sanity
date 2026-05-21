export type Gender = "M" | "F";

export type Mode = "guest" | "host";

export interface Settings {
  facility: string;
  agencyOib: string;
  defaultArrivalOrg: string;
  defaultCheckInTime: string;
  defaultCheckOutTime: string;
}

export interface Tourist {
  id: string;
  facility: string;
  stayFrom: string;
  timeStayFrom: string;
  foreseenStayUntil: string;
  timeEstimatedStayUntil: string;
  documentType: string;
  documentNumber: string;
  touristName: string;
  touristMiddleName: string;
  touristSurname: string;
  gender: Gender | "";
  dateOfBirth: string;
  countryOfBirth: string;
  cityOfBirth: string;
  citizenship: string;
  countryOfResidence: string;
  cityOfResidence: string;
  residenceAddress: string;
  touristEmail: string;
  touristTelephone: string;
  borderCrossing: string;
  passageDate: string;
  ttPaymentCategory: string;
  arrivalOrganisation: string;
  touristAgency: string;
  offeredServiceType: string;
  isTTFlatRatePaymentVacationHome: string;
}

export interface AppState {
  mode: Mode | null;
  settings: Settings;
  tourists: Tourist[];
}

export interface ValidationError {
  field: keyof Tourist;
  message: string;
}

export interface TouristValidation {
  ok: boolean;
  errors: ValidationError[];
}

export interface Country {
  code: string;
  name: string;
}

export interface DocumentTypeOption {
  code: string;
  label: string;
}
