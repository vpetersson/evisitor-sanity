import { COUNTRIES, countryName } from "./countries.ts";
import { DOCUMENT_TYPES, PAYMENT_CATEGORIES } from "./document-types.ts";
import { serialiseImportTourists, xmlEscape } from "./xml.ts";
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

const SORTED_COUNTRIES = [...COUNTRIES].sort((a, b) =>
  a.name.localeCompare(b.name, "en"),
);

/* ─────────────────────────── Settings ─────────────────────────── */

type SettingsFieldDef = {
  key: keyof Settings;
  label: string;
  type: "text" | "time";
  placeholder?: string;
  help: string;
};

const SETTINGS_FIELDS: SettingsFieldDef[] = [
  {
    key: "facility",
    label: "Facility code",
    type: "text",
    placeholder: "e.g. 12345-67",
    help: "Your property's facility code from eVisitor. You'll find it on your dashboard after you registered your accommodation.",
  },
  {
    key: "agencyOib",
    label: "Travel agency OIB (optional)",
    type: "text",
    placeholder: "11-digit number, leave blank if none",
    help: "If most of your guests arrive through a travel agency, enter the agency's 11-digit Croatian tax number (OIB). Leave blank otherwise.",
  },
  {
    key: "defaultArrivalOrg",
    label: "Default arrival code (MUP)",
    type: "text",
    placeholder: "e.g. individual booking",
    help: "The code from the Ministry of the Interior (MUP) describing how guests typically arrive — for example individual booking, organised group, business stay.",
  },
  {
    key: "defaultCheckInTime",
    label: "Default check-in time",
    type: "time",
    help: "Used as the arrival time when you add a new guest. You can change it per guest if needed.",
  },
  {
    key: "defaultCheckOutTime",
    label: "Default check-out time",
    type: "time",
    help: "Used as the leaving time when you add a new guest. You can change it per guest if needed.",
  },
];

export function renderSettings(state: AppState): void {
  const root = $("#settings-fields");
  root.innerHTML = SETTINGS_FIELDS.map((f) => {
    const id = `s-${f.key}`;
    return fieldShell({
      id,
      label: f.label,
      help: f.help,
      control: `<input id="${id}" class="field-input" type="${f.type}" name="${f.key}"
                        placeholder="${escapeAttr(f.placeholder ?? "")}"
                        value="${escapeAttr(String(state.settings[f.key] ?? ""))}" />`,
    });
  }).join("");

  const status = $("#settings-status");
  if (state.settings.facility) {
    status.textContent = "Saved. Stays in your browser, never sent anywhere.";
  } else {
    status.textContent = "Stays in your browser. Nothing is sent.";
  }
}

/* ─────────────────────────── Guests ─────────────────────────── */

type FieldDef = {
  key: keyof Tourist;
  label: string;
  type: "text" | "date" | "time" | "email" | "tel";
  placeholder?: string;
  help: string;
  control?: "country" | "documentType" | "payment" | "gender";
  required?: boolean;
};

const IDENTITY_FIELDS: FieldDef[] = [
  { key: "touristName", label: "First name", type: "text", required: true, help: "The guest's given name, exactly as written on their passport or ID." },
  { key: "touristSurname", label: "Last name", type: "text", required: true, help: "The guest's family name, exactly as written on their passport or ID." },
  { key: "touristMiddleName", label: "Middle name (optional)", type: "text", help: "Only include if the guest has a middle name on their travel document." },
  { key: "dateOfBirth", label: "Date of birth", type: "date", required: true, help: "The guest's date of birth, as printed on their passport or ID." },
  { key: "citizenship", label: "Citizenship", type: "text", required: true, control: "country", help: "The country that issued the guest's passport or ID — i.e. the country of citizenship, which may differ from where they live." },
  { key: "countryOfBirth", label: "Country of birth", type: "text", required: true, control: "country", help: "The country where the guest was born, as listed on their travel document." },
  { key: "cityOfBirth", label: "City of birth", type: "text", required: true, help: "The town or city where the guest was born, as listed on their travel document." },
  { key: "countryOfResidence", label: "Country of residence", type: "text", required: true, control: "country", help: "The country where the guest normally lives." },
  { key: "cityOfResidence", label: "City of residence", type: "text", required: true, help: "The town or city where the guest normally lives." },
  { key: "residenceAddress", label: "Home address (optional)", type: "text", help: "The guest's full street address at home — only if you have it." },
  { key: "touristEmail", label: "Email (optional)", type: "email", help: "The guest's contact email if you have it. Helps eVisitor reach them if needed." },
  { key: "touristTelephone", label: "Phone (optional)", type: "tel", help: "The guest's contact phone if you have it." },
];

const DOC_FIELDS: FieldDef[] = [
  { key: "documentType", label: "ID document type", type: "text", required: true, control: "documentType", help: "What kind of document the guest is travelling with — usually a passport, sometimes a national ID card." },
  { key: "documentNumber", label: "ID document number", type: "text", required: true, help: "The document number printed on the guest's passport or ID card." },
];

const STAY_FIELDS: FieldDef[] = [
  { key: "stayFrom", label: "Check-in date", type: "date", required: true, help: "The date the guest arrives at your property." },
  { key: "timeStayFrom", label: "Check-in time", type: "time", required: true, help: "The expected arrival time. Pre-filled from your defaults; change it per guest if needed." },
  { key: "foreseenStayUntil", label: "Check-out date", type: "date", required: true, help: "The date the guest is expected to leave your property." },
  { key: "timeEstimatedStayUntil", label: "Check-out time", type: "time", required: true, help: "The expected leaving time. Pre-filled from your defaults; change it per guest if needed." },
];

const TAX_FIELDS: FieldDef[] = [
  { key: "ttPaymentCategory", label: "Tourist tax category", type: "text", required: true, control: "payment", help: "How the tourist tax applies — standard rate, reduced rate (e.g. teens), or full exemption (e.g. young children, people with disabilities)." },
  { key: "arrivalOrganisation", label: "Arrival code (MUP)", type: "text", required: true, help: "MUP code describing how this guest arrived — for example individual booking or organised group. Pre-filled from your defaults." },
];

const EXTRA_FIELDS: FieldDef[] = [
  { key: "borderCrossing", label: "Border crossing (optional)", type: "text", help: "The name of the border crossing where the guest entered Croatia, if you have that detail." },
  { key: "passageDate", label: "Border crossing date (optional)", type: "date", help: "The date the guest crossed the border into Croatia, if known." },
  { key: "touristAgency", label: "Travel agency OIB (optional)", type: "text", help: "Override of the default. Only set if this particular guest came through a different travel agency — enter that agency's 11-digit OIB." },
  { key: "offeredServiceType", label: "Service type offered (optional)", type: "text", help: "The kind of service you provide for this guest — e.g. bed only, bed and breakfast, half board, full board." },
];

export function renderTouristList(state: AppState, handlers: Handlers): void {
  const root = $("#tourist-list");
  root.innerHTML = "";

  let totalErrors = 0;
  state.tourists.forEach((t, idx) => {
    const v = validateTourist(t);
    totalErrors += v.errors.length;
    root.appendChild(renderTouristCard(t, idx, v.errors, handlers));
  });

  const summary = $("#guest-summary-row");
  if (state.tourists.length === 0) {
    summary.textContent = "No guests yet. Add one above.";
    summary.className = "summary-row";
  } else if (totalErrors === 0) {
    summary.innerHTML = `<span class="chip chip-ok">All set</span> ${state.tourists.length} guest${state.tourists.length === 1 ? "" : "s"} ready to save.`;
    summary.className = "summary-row";
  } else {
    summary.innerHTML = `<span class="chip chip-error">${totalErrors} field${totalErrors === 1 ? "" : "s"} to fix</span> Once they're filled in, you can save the file.`;
    summary.className = "summary-row";
  }

  const downloadBtn = $("#btn-download") as HTMLButtonElement;
  const stickyBtn = $("#btn-download-sticky") as HTMLButtonElement;
  const disabled = totalErrors > 0 || state.tourists.length === 0;
  downloadBtn.disabled = disabled;
  stickyBtn.disabled = disabled;

  const status = $("#download-status");
  const stickyStatus = $("#sticky-status");
  if (state.tourists.length === 0) {
    status.textContent = "Add at least one guest above first.";
    stickyStatus.textContent = "Add a guest";
  } else if (totalErrors > 0) {
    status.textContent = "Fill in the missing fields above to enable saving.";
    stickyStatus.textContent = `${totalErrors} to fix`;
  } else {
    const word = state.tourists.length === 1 ? "guest" : "guests";
    status.textContent = `${state.tourists.length} ${word} ready. Click to save the file to your computer.`;
    stickyStatus.textContent = `${state.tourists.length} ${word} ready`;
  }
}

function renderTouristCard(
  t: Tourist,
  idx: number,
  errors: ValidationError[],
  handlers: Handlers,
): HTMLElement {
  const errorByField = new Map<keyof Tourist, string>();
  for (const e of errors) errorByField.set(e.field, e.message);

  const article = document.createElement("article");
  article.className = "guest-card";
  article.dataset["id"] = t.id;

  const headlineName = guestDisplayName(t);
  const sub = guestSubline(t);
  const okChip =
    errors.length === 0
      ? `<span class="chip chip-ok">Looks good</span>`
      : `<span class="chip chip-error">${errors.length} to fix</span>`;

  article.innerHTML = `
    <header class="guest-header">
      <div>
        <span class="guest-eyebrow">Guest ${idx + 1}</span>
        <h3 class="guest-name">${escapeAttr(headlineName)}</h3>
        ${sub ? `<p class="guest-sub">${escapeAttr(sub)}</p>` : ""}
      </div>
      <div class="guest-header-actions">
        ${okChip}
        <button type="button" class="btn btn-danger btn-small" data-action="remove">Remove guest</button>
      </div>
    </header>

    ${section("Who is the guest", IDENTITY_FIELDS, t, errorByField)}
    ${section("Travel document", DOC_FIELDS, t, errorByField)}
    ${section("Stay dates", STAY_FIELDS, t, errorByField)}
    ${section("Tax and arrival", TAX_FIELDS, t, errorByField)}

    <details class="more-options">
      <summary>More options <span class="chev" aria-hidden="true">›</span></summary>
      ${section("", EXTRA_FIELDS, t, errorByField)}
    </details>
  `;

  // Field input wiring
  article.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (!target.name) return;
    handlers.onTouristChange(t.id, { [target.name]: target.value } as Partial<Tourist>);
  });
  article.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (!target.name) return;
    handlers.onTouristChange(t.id, { [target.name]: target.value } as Partial<Tourist>);
  });

  // Gender pills
  article.querySelectorAll<HTMLButtonElement>("[data-gender]").forEach((b) => {
    b.addEventListener("click", () => {
      handlers.onTouristChange(t.id, { gender: b.dataset["gender"] as Tourist["gender"] });
    });
  });

  // Remove
  article
    .querySelector<HTMLButtonElement>("[data-action='remove']")!
    .addEventListener("click", () => handlers.onRemoveTourist(t.id));

  return article;
}

function section(
  title: string,
  fields: FieldDef[],
  t: Tourist,
  errors: Map<keyof Tourist, string>,
): string {
  const heading = title ? `<h4 class="section-title">${title}</h4>` : "";

  // Gender is rendered in-line in the identity section
  const fieldsHtml = fields.map((f) => renderField(t, f, errors)).join("");
  const genderHtml = fields === IDENTITY_FIELDS ? renderGender(t, errors) : "";

  return `<section class="guest-section">
    ${heading}
    <div class="form-grid">${genderHtml}${fieldsHtml}</div>
  </section>`;
}

function renderField(
  t: Tourist,
  f: FieldDef,
  errors: Map<keyof Tourist, string>,
): string {
  const id = `t-${t.id}-${String(f.key)}`;
  const value = String(t[f.key] ?? "");
  const err = errors.get(f.key);
  const ariaInvalid = err ? "true" : "false";

  let control = "";
  if (f.control === "country") {
    control = renderCountrySelect(id, f.key, value, ariaInvalid);
  } else if (f.control === "documentType") {
    control = `<select id="${id}" class="field-select" name="${f.key}" aria-invalid="${ariaInvalid}">
      ${DOCUMENT_TYPES.map((d) => `<option value="${escapeAttr(d.code)}" ${d.code === value ? "selected" : ""}>${escapeAttr(d.label)}</option>`).join("")}
    </select>`;
  } else if (f.control === "payment") {
    control = `<select id="${id}" class="field-select" name="${f.key}" aria-invalid="${ariaInvalid}">
      <option value="">Choose a category…</option>
      ${PAYMENT_CATEGORIES.map((p) => `<option value="${escapeAttr(p)}" ${p === value ? "selected" : ""}>${escapeAttr(p)}</option>`).join("")}
    </select>`;
  } else {
    control = `<input id="${id}" class="field-input" type="${f.type}" name="${f.key}"
              placeholder="${escapeAttr(f.placeholder ?? "")}"
              value="${escapeAttr(value)}" aria-invalid="${ariaInvalid}" />`;
  }

  return fieldShell({
    id,
    label: f.label,
    help: f.help,
    control,
    error: err,
  });
}

function renderCountrySelect(
  id: string,
  name: keyof Tourist,
  value: string,
  ariaInvalid: string,
): string {
  const options = SORTED_COUNTRIES.map(
    (c) => `<option value="${c.code}" ${c.code === value ? "selected" : ""}>${escapeAttr(c.name)}</option>`,
  ).join("");
  return `<select id="${id}" class="field-select" name="${String(name)}" aria-invalid="${ariaInvalid}">
    <option value="">Choose a country…</option>
    ${options}
  </select>`;
}

function renderGender(t: Tourist, errors: Map<keyof Tourist, string>): string {
  const err = errors.get("gender");
  return fieldShell({
    id: `t-${t.id}-gender`,
    label: "Sex (as on document)",
    help: "Pick the option that matches the guest's travel document.",
    error: err,
    control: `
      <div class="gender-group" role="group" aria-invalid="${err ? "true" : "false"}">
        <button type="button" class="gender-pill" data-gender="M" aria-pressed="${t.gender === "M"}">Male</button>
        <button type="button" class="gender-pill" data-gender="F" aria-pressed="${t.gender === "F"}">Female</button>
      </div>
    `,
  });
}

/* ─────────────────────────── Field shell ─────────────────────────── */

type ShellArgs = {
  id: string;
  label: string;
  help: string;
  control: string;
  error?: string | undefined;
};

function fieldShell({ id, label, help, control, error }: ShellArgs): string {
  const helpId = `${id}-help`;
  return `
    <label class="field" for="${id}">
      <span class="field-label-row">
        <span class="field-label">${escapeAttr(label)}</span>
        <button type="button" class="help-btn" aria-controls="${helpId}" aria-expanded="false"
                aria-label="Help: ${escapeAttr(label)}" data-help-toggle>?</button>
      </span>
      ${control}
      <span id="${helpId}" class="field-help" hidden>${escapeAttr(help)}</span>
      ${error ? `<span class="field-error">${escapeAttr(error)}</span>` : ""}
    </label>
  `;
}

/* ─────────────────────────── File preview ─────────────────────────── */

export function renderXmlPreview(xml: string): void {
  const pre = $("#xml-preview");
  pre.innerHTML = xml
    .split("\n")
    .map((line) => `<code>${highlightLine(line)}</code>`)
    .join("");
}

function highlightLine(line: string): string {
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

/* ─────────────────────────── Helpers ─────────────────────────── */

function escapeAttr(value: string): string {
  return xmlEscape(value);
}

function guestDisplayName(t: Tourist): string {
  const name = [t.touristName, t.touristMiddleName, t.touristSurname]
    .filter(Boolean)
    .join(" ");
  return name || "New guest";
}

function guestSubline(t: Tourist): string {
  const parts: string[] = [];
  const country = t.citizenship ? countryName(t.citizenship) : undefined;
  if (country) parts.push(country);
  if (t.stayFrom && t.foreseenStayUntil) {
    parts.push(`${formatHumanDate(t.stayFrom)} → ${formatHumanDate(t.foreseenStayUntil)}`);
  }
  return parts.join(" · ");
}

function formatHumanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${parseInt(m[3]!, 10)} ${months[parseInt(m[2]!, 10) - 1]} ${m[1]}`;
}

/* ─────────────────────────── Re-render orchestration ─────────────────────────── */

export function renderAll(state: AppState, handlers: Handlers): void {
  renderSettings(state);
  renderTouristList(state, handlers);
  renderXmlPreview(serialiseImportTourists(state.tourists));
}
