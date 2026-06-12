import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { countryName } from "../src/countries.ts";
import type { AppState, Settings, Tourist } from "../src/types.ts";

const HTML = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");

const SETTINGS: Settings = {
  facility: "",
  agencyOib: "",
  defaultArrivalOrg: "",
  defaultCheckInTime: "15:00",
  defaultCheckOutTime: "10:00",
};

// happy-dom's element types don't line up with the DOM lib's querySelector
// overloads, so use a tiny casting helper rather than fight the generics.
type El = {
  querySelector(sel: string): unknown;
  querySelectorAll(sel: string): unknown;
};
function pick<T>(root: El | null, sel: string): T {
  return root!.querySelector(sel) as T;
}

function tourist(id: string): Tourist {
  return {
    id,
    facility: "",
    stayFrom: "",
    timeStayFrom: "15:00",
    foreseenStayUntil: "",
    timeEstimatedStayUntil: "10:00",
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
    arrivalOrganisation: "",
    touristAgency: "",
    offeredServiceType: "",
    isTTFlatRatePaymentVacationHome: "true",
  };
}

const GLOBAL_KEYS = ["window", "document", "Event", "Node", "HTMLElement"] as const;
let win: Window;

beforeEach(() => {
  win = new Window({ url: "https://example.test/" });
  // Real browsers always expose window.SyntaxError; happy-dom under the bun
  // test runner doesn't, which would mask its selector parser. Restore it.
  (win as unknown as Record<string, unknown>)["SyntaxError"] = SyntaxError;
  win.document.write(HTML);
  const g = globalThis as Record<string, unknown>;
  g["window"] = win;
  g["document"] = win.document;
  g["Event"] = win.Event;
  g["Node"] = win.Node;
  g["HTMLElement"] = win.HTMLElement;
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  for (const k of GLOBAL_KEYS) delete g[k];
});

// Wire handlers the way main.ts does, so the test exercises the real refresh path.
async function setup(mode: "guest" | "host") {
  const { renderForMode, refreshTourist } = await import("../src/render.ts");
  const state: AppState = {
    mode,
    settings: SETTINGS,
    tourists: [tourist("aaa")],
    ui: { touched: new Set<string>(), submitAttempted: false },
  };
  const handlers = {
    onSettingsChange() {},
    onTouristChange(id: string, patch: Partial<Tourist>) {
      const idx = state.tourists.findIndex((t) => t.id === id);
      state.tourists[idx] = { ...state.tourists[idx]!, ...patch };
      refreshTourist(state, id);
    },
    onTouristBlur(id: string, field: keyof Tourist) {
      state.ui.touched.add(`${id}::${String(field)}`);
      refreshTourist(state, id);
    },
    onRemoveTourist() {},
  };
  renderForMode(state, handlers);
  const list = win.document.getElementById("guest-tourist-list") as unknown as El;
  return { state, list };
}

function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
}

describe("in-place card refresh", () => {
  it("does NOT replace the input being typed in (focus survives)", async () => {
    const { state, list } = await setup("guest");
    const input = pick<HTMLInputElement>(list, 'input[name="touristName"]');
    input.focus();

    // Type three characters one at a time, like a real user.
    for (const v of ["J", "Ja", "Jan"]) {
      const before = pick<unknown>(list, 'input[name="touristName"]');
      typeInto(input, v);
      const after = pick<unknown>(list, 'input[name="touristName"]');
      // The exact same DOM node must remain — this is what the old code broke.
      expect(after).toBe(before);
      expect(after).toBe(input as unknown);
      expect(win.document.activeElement).toBe(input as never);
    }
    expect(state.tourists[0]!.touristName).toBe("Jan");
  });

  it("hides required-field errors until a field is blurred", async () => {
    const { state, list } = await setup("guest");
    const nameLabel = pick<El>(list, '[data-field="touristName"]');
    const err = pick<HTMLElement>(nameLabel, ".field-error");

    // Pristine: empty + untouched → no visible error.
    expect(err.hidden).toBe(true);

    // Blur the empty field → error appears.
    const input = pick<HTMLInputElement>(nameLabel, "input");
    input.dispatchEvent(new win.Event("focusout", { bubbles: true }) as unknown as Event);
    expect(state.ui.touched.has("aaa::touristName")).toBe(true);
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain("fill");
  });

  it("country combobox stores the ISO code from a typed name", async () => {
    const { state, list } = await setup("guest");
    const input = pick<HTMLInputElement>(list, 'input[name="citizenship"]');
    typeInto(input, "Germany");
    const code = state.tourists[0]!.citizenship;
    expect(code).not.toBe("Germany"); // resolved to a code, not the label
    expect(countryName(code)).toBe("Germany");
  });

  it("date of birth is masked to YYYY-MM-DD as digits arrive", async () => {
    const { state, list } = await setup("guest");
    const input = pick<HTMLInputElement>(list, 'input[name="dateOfBirth"]');
    typeInto(input, "19850415");
    expect(input.value).toBe("1985-04-15");
    expect(state.tourists[0]!.dateOfBirth).toBe("1985-04-15");
  });
});
