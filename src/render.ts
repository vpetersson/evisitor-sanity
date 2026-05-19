import { COUNTRIES } from "./countries.ts";
import { DOCUMENT_TYPES, PAYMENT_CATEGORIES } from "./document-types.ts";
import { xmlEscape, toEvisitorDate, toEvisitorTime } from "./xml.ts";
import { validateTourist } from "./validation.ts";
import type {
  AppState,
  Settings,
  Tourist,
  ValidationError,
} from "./types.ts";

type Handlers = {
  onSettingsChange: (patch: Partial<Settings>) => void;
  onTouristChange: (id: string, patch: Partial<Tourist>) => void;
  onRemoveTourist: (id: string) => void;
};

const $ = <T extends Element>(sel: string, root: ParentNode = document): T => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

export function renderCountryDatalist(): void {
  const list = $("#country-codes") as HTMLDataListElement;
  list.innerHTML = COUNTRIES.map(
    (c) => `<option value="${c.code}" label="${c.name} (${c.code})">${c.name}</option>`,
  ).join("");
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

const SETTINGS_FIELDS: Array<{
  key: keyof Settings;
  label: string;
  type: "text" | "time";
  placeholder?: string;
  hint?: string;
}> = [
  {
    key: "facility",
    label: "Facility code",
    type: "text",
    placeholder: "e.g. 12345-67",
    hint: "Required. Assigned by eVisitor when you registered your facility.",
  },
  {
    key: "agencyOib",
    label: "Tourist agency OIB",
    type: "text",
    placeholder: "Optional — 11 digits",
    hint: "Only if guests arrive via a tourist agency.",
  },
  {
    key: "defaultArrivalOrg",
    label: "Default Arrival Organisation (MUP code)",
    type: "text",
    placeholder: "e.g. PUI",
    hint: "The MUP code applied to every new guest.",
  },
  {
    key: "defaultCheckInTime",
    label: "Default check-in time",
    type: "time",
  },
  {
    key: "defaultCheckOutTime",
    label: "Default check-out time",
    type: "time",
  },
];

export function renderSettings(
  state: AppState,
  handlers: Handlers,
): void {
  const root = $("#settings-fields");
  root.innerHTML = "";
  for (const f of SETTINGS_FIELDS) {
    const wrap = document.createElement("label");
    wrap.innerHTML = `
      <span class="field-label">${f.label}</span>
      <input class="field-input" type="${f.type}" name="${f.key}"
             placeholder="${f.placeholder ?? ""}"
             value="${escapeAttr(String(state.settings[f.key] ?? ""))}" />
      ${f.hint ? `<span class="block mt-1 text-[12px] text-[color:var(--color-ink-3)]">${f.hint}</span>` : ""}
    `;
    const input = wrap.querySelector("input")!;
    input.addEventListener("input", () => {
      handlers.onSettingsChange({ [f.key]: input.value } as Partial<Settings>);
    });
    root.appendChild(wrap);
  }
}

/* ── Tourist cards ────────────────────────────────────────────────────────── */

type FieldDef = {
  key: keyof Tourist;
  label: string;
  type: "text" | "date" | "time" | "email" | "tel" | "textarea";
  placeholder?: string;
  list?: string;
  required?: boolean;
  half?: boolean;
};

const FIELDS: FieldDef[] = [
  { key: "stayFrom", label: "Arrival date", type: "date", required: true, half: true },
  { key: "timeStayFrom", label: "Arrival time", type: "time", required: true, half: true },
  { key: "foreseenStayUntil", label: "Departure date", type: "date", required: true, half: true },
  { key: "timeEstimatedStayUntil", label: "Departure time", type: "time", required: true, half: true },

  { key: "touristName", label: "First name", type: "text", required: true, half: true },
  { key: "touristMiddleName", label: "Middle name", type: "text", half: true },
  { key: "touristSurname", label: "Surname", type: "text", required: true, half: true },
  { key: "dateOfBirth", label: "Date of birth", type: "date", required: true, half: true },

  { key: "documentType", label: "Document type", type: "text", required: true, half: true },
  { key: "documentNumber", label: "Document number", type: "text", required: true, half: true },

  { key: "citizenship", label: "Citizenship (ISO-3)", type: "text", required: true, half: true, list: "country-codes" },
  { key: "countryOfBirth", label: "Country of birth (ISO-3)", type: "text", required: true, half: true, list: "country-codes" },
  { key: "cityOfBirth", label: "City of birth", type: "text", required: true, half: true },
  { key: "countryOfResidence", label: "Country of residence (ISO-3)", type: "text", required: true, half: true, list: "country-codes" },
  { key: "cityOfResidence", label: "City of residence", type: "text", required: true, half: true },
  { key: "residenceAddress", label: "Residence address", type: "text", half: true },

  { key: "touristEmail", label: "Email (optional)", type: "email", half: true },
  { key: "touristTelephone", label: "Phone (optional)", type: "tel", half: true },

  { key: "borderCrossing", label: "Border crossing (optional)", type: "text", half: true },
  { key: "passageDate", label: "Passage date (optional)", type: "date", half: true },

  { key: "ttPaymentCategory", label: "Tourist tax category", type: "text", required: true, half: true },
  { key: "arrivalOrganisation", label: "Arrival organisation (MUP code)", type: "text", required: true, half: true },

  { key: "touristAgency", label: "Tourist agency OIB (optional)", type: "text", half: true },
  { key: "offeredServiceType", label: "Offered service type (optional)", type: "text", half: true },
];

export function renderTouristList(state: AppState, handlers: Handlers): void {
  const root = $("#tourist-list");
  root.innerHTML = "";

  let totalErrors = 0;
  state.tourists.forEach((t, idx) => {
    const v = validateTourist(t);
    totalErrors += v.errors.length;
    const card = renderTouristCard(t, idx, v.errors, handlers);
    root.appendChild(card);
  });

  // Summary
  const summary = $("#tourist-summary");
  if (totalErrors === 0) {
    summary.className = "chip chip-ok";
    summary.textContent = `${state.tourists.length} guest${state.tourists.length === 1 ? "" : "s"} · ready`;
  } else {
    summary.className = "chip chip-error";
    summary.textContent = `${totalErrors} field${totalErrors === 1 ? "" : "s"} need attention`;
  }

  const downloadBtn = $("#btn-download") as HTMLButtonElement;
  downloadBtn.disabled = totalErrors > 0 || state.tourists.length === 0;
  const status = $("#download-status");
  status.textContent =
    totalErrors > 0
      ? "Fix highlighted fields to enable download."
      : `Ready: ${state.tourists.length} guest${state.tourists.length === 1 ? "" : "s"}.`;
}

function renderTouristCard(
  t: Tourist,
  idx: number,
  errors: ValidationError[],
  handlers: Handlers,
): HTMLElement {
  const errorByField = new Map<keyof Tourist, string>();
  for (const e of errors) errorByField.set(e.field, e.message);

  const card = document.createElement("article");
  card.className = "card p-6 md:p-7";
  card.dataset["id"] = t.id;

  const num = String(idx + 1).padStart(2, "0");
  card.innerHTML = `
    <header class="flex items-start justify-between gap-4 mb-5">
      <div class="flex items-baseline gap-4">
        <span class="numeral text-5xl md:text-6xl text-[color:var(--color-adriatic)] leading-none">${num}</span>
        <div>
          <span class="eyebrow">Guest · ${shortId(t.id)}</span>
          <h3 class="display-serif text-xl font-light mt-1">${guestDisplayName(t)}</h3>
        </div>
      </div>
      <div class="flex items-center gap-2">
        ${errors.length === 0
          ? `<span class="chip chip-ok">ok</span>`
          : `<span class="chip chip-error">${errors.length} to fix</span>`}
        <button class="btn btn-danger text-[12.5px] px-3 py-1.5" data-action="remove" aria-label="Remove guest">Remove</button>
      </div>
    </header>

    <div class="grid md:grid-cols-2 gap-x-8 gap-y-5">
      ${renderGenderField(t, errorByField)}
      <div class="hidden md:block"></div>
      ${FIELDS.map((f) => renderField(t, f, errorByField)).join("")}
    </div>
  `;

  card.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target.name) return;
    handlers.onTouristChange(t.id, { [target.name]: target.value } as Partial<Tourist>);
  });

  card.querySelectorAll<HTMLButtonElement>("[data-gender]").forEach((b) => {
    b.addEventListener("click", () => {
      handlers.onTouristChange(t.id, { gender: b.dataset["gender"] as Tourist["gender"] });
    });
  });

  card
    .querySelector<HTMLButtonElement>("[data-action='remove']")!
    .addEventListener("click", () => handlers.onRemoveTourist(t.id));

  return card;
}

function renderField(
  t: Tourist,
  f: FieldDef,
  errorByField: Map<keyof Tourist, string>,
): string {
  const value = String(t[f.key] ?? "");
  const err = errorByField.get(f.key);
  const invalid = err ? "true" : "false";
  const cls = `field-input`;

  let control: string;
  if (f.key === "documentType") {
    control = `<select class="field-select" name="${f.key}" aria-invalid="${invalid}">
      ${DOCUMENT_TYPES.map(
        (d) => `<option value="${d.code}" ${d.code === value ? "selected" : ""}>${d.label}</option>`,
      ).join("")}
    </select>`;
  } else if (f.key === "ttPaymentCategory") {
    control = `<input class="${cls}" name="${f.key}" type="text" list="payment-categories"
      placeholder="${f.placeholder ?? "Type or pick"}"
      value="${escapeAttr(value)}" aria-invalid="${invalid}" />
      <datalist id="payment-categories">
        ${PAYMENT_CATEGORIES.map((p) => `<option value="${escapeAttr(p)}"></option>`).join("")}
      </datalist>`;
  } else if (f.type === "textarea") {
    control = `<textarea class="field-textarea" name="${f.key}" aria-invalid="${invalid}">${escapeAttr(value)}</textarea>`;
  } else {
    const listAttr = f.list ? `list="${f.list}"` : "";
    control = `<input class="${cls}" name="${f.key}" type="${f.type}" ${listAttr}
       placeholder="${escapeAttr(f.placeholder ?? "")}"
       value="${escapeAttr(value)}" aria-invalid="${invalid}" />`;
  }

  const colspan = f.half ? "" : "md:col-span-2";
  return `
    <label class="${colspan}">
      <span class="field-label">${f.label}${f.required ? "" : " · optional"}</span>
      ${control}
      ${err ? `<span class="field-error">${escapeAttr(err)}</span>` : ""}
    </label>
  `;
}

function renderGenderField(t: Tourist, errorByField: Map<keyof Tourist, string>): string {
  const err = errorByField.get("gender");
  return `
    <div>
      <span class="field-label">Gender</span>
      <div class="gender-group" role="group" aria-invalid="${err ? "true" : "false"}">
        <button type="button" class="gender-pill" data-gender="M" aria-pressed="${t.gender === "M"}">Male</button>
        <button type="button" class="gender-pill" data-gender="F" aria-pressed="${t.gender === "F"}">Female</button>
      </div>
      ${err ? `<div class="field-error">${escapeAttr(err)}</div>` : ""}
    </div>
  `;
}

/* ── XML preview ──────────────────────────────────────────────────────────── */

export function renderXmlPreview(xml: string): void {
  const pre = $("#xml-preview");
  pre.innerHTML = formatXmlForPreview(xml);
}

function formatXmlForPreview(xml: string): string {
  return xml
    .split("\n")
    .map((line) => `<code>${highlightXmlLine(line)}</code>`)
    .join("");
}

function highlightXmlLine(line: string): string {
  // Encode entities so we never inject raw markup, then colourise tag names.
  const safe = line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (safe.trim().startsWith("&lt;?xml")) return `<span class="xml-decl">${safe}</span>`;

  return safe.replace(
    /(&lt;\/?)([A-Za-z][\w]*)(&gt;)/g,
    (_, lt: string, name: string, gt: string) =>
      `<span class="tag-open">${lt}</span><span class="tag-name">${name}</span><span class="tag-open">${gt}</span>`,
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function escapeAttr(value: string): string {
  return xmlEscape(value);
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function guestDisplayName(t: Tourist): string {
  const name = [t.touristName, t.touristMiddleName, t.touristSurname]
    .filter(Boolean)
    .join(" ");
  if (name) return name;
  return "Untitled guest";
}

// Re-export utilities consumed elsewhere
export { toEvisitorDate, toEvisitorTime };
