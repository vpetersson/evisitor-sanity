import type { AppState, Mode, Settings, Tourist } from "./types.ts";

const SETTINGS_KEY = "evx.settings.v1";
const MODE_KEY = "evx.mode.v1";

export function loadMode(): Mode | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(MODE_KEY);
  return raw === "guest" || raw === "host" ? raw : null;
}

export function saveMode(mode: Mode): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(MODE_KEY, mode);
}

export function clearMode(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(MODE_KEY);
}

const DEFAULT_SETTINGS: Settings = {
  facility: "",
  agencyOib: "",
  defaultArrivalOrg: "",
  defaultCheckInTime: "15:00",
  defaultCheckOutTime: "10:00",
};

export function loadSettings(): Settings {
  if (typeof localStorage === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearSettings(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SETTINGS_KEY);
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

export function blankTourist(settings: Settings): Tourist {
  return {
    id: newId(),
    facility: settings.facility,
    stayFrom: "",
    timeStayFrom: settings.defaultCheckInTime,
    foreseenStayUntil: "",
    timeEstimatedStayUntil: settings.defaultCheckOutTime,
    documentType: "Passport",
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
    arrivalOrganisation: settings.defaultArrivalOrg,
    touristAgency: settings.agencyOib,
    offeredServiceType: "",
  };
}

export function sampleTourist(settings: Settings): Tourist {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const inSevenDays = new Date(today);
  inSevenDays.setDate(today.getDate() + 7);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  return {
    ...blankTourist(settings),
    stayFrom: fmt(tomorrow),
    foreseenStayUntil: fmt(inSevenDays),
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
    ttPaymentCategory: "Standard",
  };
}

export function createInitialState(): AppState {
  const settings = loadSettings();
  return {
    mode: loadMode(),
    settings,
    tourists: [blankTourist(settings)],
  };
}
