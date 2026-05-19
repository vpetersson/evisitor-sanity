import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { blankTourist, loadSettings, saveSettings } from "../src/state.ts";

const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    key: (i) => Array.from(data.keys())[i] ?? null,
  };
};

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe("settings persistence", () => {
  it("returns defaults when localStorage is empty", () => {
    const s = loadSettings();
    expect(s.facility).toBe("");
    expect(s.defaultCheckInTime).toBe("15:00");
  });

  it("round-trips through saveSettings", () => {
    saveSettings({
      facility: "FAC-77",
      agencyOib: "12345678901",
      defaultArrivalOrg: "PUI",
      defaultCheckInTime: "16:00",
      defaultCheckOutTime: "11:00",
    });
    const s = loadSettings();
    expect(s.facility).toBe("FAC-77");
    expect(s.defaultCheckInTime).toBe("16:00");
  });

  it("falls back to defaults when stored JSON is corrupt", () => {
    (globalThis.localStorage as Storage).setItem("evx.settings.v1", "{not json");
    const s = loadSettings();
    expect(s.facility).toBe("");
  });
});

describe("blankTourist", () => {
  it("seeds defaults from settings and a fresh id", () => {
    const a = blankTourist({
      facility: "FAC-1",
      agencyOib: "OIB",
      defaultArrivalOrg: "ORG",
      defaultCheckInTime: "14:00",
      defaultCheckOutTime: "11:00",
    });
    expect(a.facility).toBe("FAC-1");
    expect(a.arrivalOrganisation).toBe("ORG");
    expect(a.timeStayFrom).toBe("14:00");
    expect(a.id).toMatch(/[0-9a-f-]{36}/i);

    const b = blankTourist({
      facility: "FAC-1",
      agencyOib: "",
      defaultArrivalOrg: "",
      defaultCheckInTime: "",
      defaultCheckOutTime: "",
    });
    expect(b.id).not.toBe(a.id);
  });
});
