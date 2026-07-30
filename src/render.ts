import { COUNTRIES, countryName } from "./countries.ts";
import { DOCUMENT_TYPES, PAYMENT_CATEGORIES } from "./document-types.ts";
import { serialiseImportTourists, xmlEscape } from "./xml.ts";
import { validateTourist } from "./validation.ts";
import type { AppState, Mode, Settings, Tourist } from "./types.ts";

type Handlers = {
  onSettingsChange: (patch: Partial<Settings>) => void;
  onTouristChange: (id: string, patch: Partial<Tourist>) => void;
  onTouristBlur: (id: string, field: keyof Tourist) => void;
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

const CODE_BY_NAME = new Map(
  COUNTRIES.map((c) => [c.name.trim().toLowerCase(), c.code]),
);

/**
 * Country fields show the human name but store the ISO code. Map a typed name
 * back to its code; keep unmatched text verbatim so validation can flag it.
 */
function resolveCountryCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  return CODE_BY_NAME.get(trimmed.toLowerCase()) ?? trimmed;
}

/** Group digits as YYYY-MM-DD as the user types, ignoring stray characters. */
function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  let out = d.slice(0, 4);
  if (d.length > 4) out += "-" + d.slice(4, 6);
  if (d.length > 6) out += "-" + d.slice(6, 8);
  return out;
}

/* ─────────────────────────── Top-level layout ─────────────────────────── */

export function renderForMode(state: AppState, handlers: Handlers): void {
  ensureCountryList();

  const chooser = document.getElementById("mode-chooser") as HTMLElement | null;
  const guestFlow = document.getElementById("guest-flow") as HTMLElement | null;
  const hostFlow = document.getElementById("host-flow") as HTMLElement | null;
  const toggle = document.getElementById("mode-toggle") as HTMLElement | null;
  const sticky = document.getElementById("sticky-cta") as HTMLElement | null;
  if (!chooser || !guestFlow || !hostFlow || !toggle || !sticky) return;

  if (state.mode === null) {
    chooser.hidden = false;
    guestFlow.hidden = true;
    hostFlow.hidden = true;
    toggle.hidden = true;
    sticky.hidden = true;
    return;
  }

  chooser.hidden = true;
  toggle.hidden = false;
  sticky.hidden = false;
  toggle
    .querySelectorAll<HTMLButtonElement>(".mode-toggle-btn")
    .forEach((b) => {
      b.setAttribute(
        "aria-pressed",
        String(b.dataset["mode"] === state.mode),
      );
    });

  if (state.mode === "guest") {
    guestFlow.hidden = false;
    hostFlow.hidden = true;
    renderGuestFlow(state, handlers);
  } else {
    guestFlow.hidden = true;
    hostFlow.hidden = false;
    renderHostFlow(state, handlers);
  }
}

/** A shared <datalist> backs every country combobox; build it once. */
function ensureCountryList(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("country-list")) return;
  const dl = document.createElement("datalist");
  dl.id = "country-list";
  dl.innerHTML = SORTED_COUNTRIES.map(
    (c) => `<option value="${escapeAttr(c.name)}"></option>`,
  ).join("");
  document.body.appendChild(dl);
}

/* ─────────────────────────── Settings (host only) ─────────────────────────── */

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
    help: "Your property's facility code from eVisitor. You'll find it on your eVisitor dashboard after you registered your accommodation.",
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
    help: "The code from the Ministry of the Interior (MUP) describing how guests typically arrive, for example individual booking, organised group or business stay.",
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

function renderSettings(state: AppState): void {
  const root = document.getElementById("settings-fields");
  if (!root) return;

  // Build the settings inputs exactly once. Rebuilding their HTML on every
  // state change would destroy whichever input the host is typing in (the same
  // focus-loss bug that plagued the guest cards), so afterwards we only sync
  // values into inputs that aren't currently focused.
  if (!root.dataset["built"]) {
    root.innerHTML = SETTINGS_FIELDS.map((f) => {
      const id = `s-${f.key}`;
      return fieldShell({
        id,
        label: f.label,
        help: f.help,
        control: `<input id="${id}" class="field-input" type="${f.type}" name="${f.key}"
                          placeholder="${escapeAttr(f.placeholder ?? "")}"
                          value="${escapeAttr(String(state.settings[f.key] ?? ""))}"
                          aria-describedby="${id}-help" />`,
      });
    }).join("");
    root.dataset["built"] = "1";
  } else {
    for (const f of SETTINGS_FIELDS) {
      const inp = document.getElementById(`s-${f.key}`) as HTMLInputElement | null;
      if (inp && inp !== document.activeElement) {
        inp.value = String(state.settings[f.key] ?? "");
      }
    }
  }

  const status = document.getElementById("settings-status");
  if (status) {
    status.textContent = state.settings.facility
      ? "Saved. Stays in your browser, never sent anywhere."
      : "Stays in your browser. Nothing is sent.";
  }
}

/* ─────────────────────────── Field definitions ─────────────────────────── */

type FieldDef = {
  key: keyof Tourist;
  label: string;
  type: "text" | "date" | "time" | "email" | "tel";
  placeholder?: string;
  help: string;
  control?: "country" | "documentType" | "payment";
  required?: boolean;
  /**
   * Force this field to the first column, starting a new row. The grid flows in
   * source order, so "Country of birth" and "City of birth" only sat next to
   * each other by luck, and they did not: citizenship fell between them and
   * paired "City of birth" with "Country of residence". Guest mode filters out
   * the optional fields, so any fix based on reordering breaks in host mode.
   */
  startsRow?: boolean;
};

const IDENTITY_FIELDS: FieldDef[] = [
  { key: "touristName", label: "First name", type: "text", required: true, help: "The guest's given name, exactly as written on their passport or ID." },
  { key: "touristSurname", label: "Last name", type: "text", required: true, help: "The guest's family name, exactly as written on their passport or ID." },
  { key: "touristMiddleName", label: "Middle name (optional)", type: "text", help: "Only include if the guest has a middle name on their travel document." },
  { key: "dateOfBirth", label: "Date of birth", type: "date", required: true, help: "The guest's date of birth, as printed on their passport or ID. Type it as year-month-day, e.g. 1985-04-15." },
  { key: "citizenship", label: "Citizenship", type: "text", required: true, control: "country", help: "The country that issued the guest's passport or ID. This is the country of citizenship, which may differ from where they live." },
  { key: "countryOfBirth", label: "Country of birth", type: "text", required: true, control: "country", startsRow: true, help: "The country where the guest was born, as listed on their travel document." },
  { key: "cityOfBirth", label: "City of birth", type: "text", required: true, help: "The town or city where the guest was born, as listed on their travel document." },
  { key: "countryOfResidence", label: "Country of residence", type: "text", required: true, control: "country", startsRow: true, help: "The country where the guest normally lives." },
  { key: "cityOfResidence", label: "City of residence", type: "text", required: true, help: "The town or city where the guest normally lives." },
  { key: "residenceAddress", label: "Home address (optional)", type: "text", help: "The guest's full street address at home, only if you have it." },
  { key: "touristEmail", label: "Email (optional)", type: "email", help: "The guest's contact email if you have it." },
  { key: "touristTelephone", label: "Phone (optional)", type: "tel", help: "The guest's contact phone if you have it." },
];

const DOC_FIELDS: FieldDef[] = [
  { key: "documentType", label: "ID document type", type: "text", required: true, control: "documentType", help: "What kind of document the guest is travelling with. Usually a passport, sometimes a national ID card." },
  { key: "documentNumber", label: "ID document number", type: "text", required: true, help: "The document number printed on the guest's passport or ID card." },
];

const STAY_FIELDS: FieldDef[] = [
  { key: "stayFrom", label: "Check-in date", type: "date", required: true, help: "The date the guest arrives at the property." },
  { key: "timeStayFrom", label: "Check-in time", type: "time", required: true, help: "The expected arrival time." },
  { key: "foreseenStayUntil", label: "Check-out date", type: "date", required: true, help: "The date the guest is expected to leave the property." },
  { key: "timeEstimatedStayUntil", label: "Check-out time", type: "time", required: true, help: "The expected leaving time." },
];

const TAX_FIELDS: FieldDef[] = [
  { key: "ttPaymentCategory", label: "Tourist tax category", type: "text", required: true, control: "payment", help: "How the tourist tax applies: standard rate, reduced rate (e.g. teens), or full exemption (e.g. young children, people with disabilities)." },
  { key: "arrivalOrganisation", label: "Arrival code (MUP)", type: "text", required: true, help: "MUP code describing how this guest arrived, for example individual booking or organised group." },
];

const EXTRA_FIELDS: FieldDef[] = [
  { key: "borderCrossing", label: "Border crossing (optional)", type: "text", help: "The border crossing where the guest entered Croatia." },
  { key: "passageDate", label: "Border crossing date (optional)", type: "date", help: "The date the guest crossed the border into Croatia." },
  { key: "touristAgency", label: "Travel agency OIB (optional)", type: "text", help: "If this guest came through a travel agency, that agency's 11-digit OIB." },
  { key: "offeredServiceType", label: "Service type offered (optional)", type: "text", help: "What you offer this guest, e.g. bed only, bed and breakfast, half board, full board." },
];

/* ─────────────────────────── Guest flow ─────────────────────────── */

function renderGuestFlow(state: AppState, handlers: Handlers): void {
  const list = document.getElementById("guest-tourist-list");
  if (!list) return;

  list.innerHTML = "";
  state.tourists.forEach((t, idx) => {
    list.appendChild(
      renderTouristCard(state, t, handlers, {
        mode: "guest",
        labelEyebrow: `Person ${idx + 1}`,
      }),
    );
  });

  refreshDerived(state);
}

/* ─────────────────────────── Host flow ─────────────────────────── */

function renderHostFlow(state: AppState, handlers: Handlers): void {
  renderSettings(state);

  const list = document.getElementById("tourist-list");
  if (!list) return;

  list.innerHTML = "";
  state.tourists.forEach((t, idx) => {
    list.appendChild(
      renderTouristCard(state, t, handlers, {
        mode: "host",
        labelEyebrow: `Guest ${idx + 1}`,
      }),
    );
  });

  refreshDerived(state);
}

/* ──────────────── Derived UI (summary, buttons, preview) ──────────────── */

let previewTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Recompute everything that depends on the whole tourist list but does NOT own
 * any focusable input: the summary line, the sticky status, and the file
 * preview. Safe to call on every keystroke.
 */
export function refreshDerived(state: AppState): void {
  const mode: Mode = state.mode ?? "host";
  const isGuest = mode === "guest";

  let totalErrors = 0;
  for (const t of state.tourists) {
    totalErrors += validateTourist(t, mode).errors.length;
  }
  const count = state.tourists.length;

  const summary = document.getElementById(
    isGuest ? "guest-summary-row" : "host-summary-row",
  );
  if (summary) {
    summary.className = "summary-row";
    if (count === 0) {
      summary.textContent = isGuest
        ? "Add at least one person above."
        : "No guests yet. Import a file or add one by hand above.";
    } else if (totalErrors === 0) {
      summary.innerHTML = isGuest
        ? `<span class="chip chip-ok">All set</span> Save the file and send it to your host.`
        : `<span class="chip chip-ok">All set</span> ${count} guest${count === 1 ? "" : "s"} ready to save.`;
    } else {
      summary.innerHTML = `<span class="chip chip-error">${totalErrors} field${totalErrors === 1 ? "" : "s"} still to fill in</span> Save will guide you to anything missing.`;
    }
  }

  const status = document.getElementById(
    isGuest ? "guest-download-status" : "download-status",
  );
  if (status) {
    status.textContent =
      count === 0
        ? isGuest
          ? "Add at least one person above first."
          : "Add at least one guest above first."
        : totalErrors > 0
        ? "Click save and we'll highlight anything still missing."
        : isGuest
        ? "Ready. The file will save to your device when you click the button."
        : `${count} guest${count === 1 ? "" : "s"} ready. Click to save the file to your computer.`;
  }

  const stickyStatus = document.getElementById("sticky-status");
  if (stickyStatus) {
    stickyStatus.textContent =
      count === 0
        ? isGuest
          ? "Add a person"
          : "Add a guest"
        : totalErrors > 0
        ? `${totalErrors} to fill in`
        : isGuest
        ? "Ready to save"
        : `${count} ready`;
  }

  // The preview is the heaviest bit of work, so debounce it.
  if (previewTimer !== undefined) clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    const previewEl = document.getElementById(
      isGuest ? "guest-xml-preview" : "xml-preview",
    );
    if (previewEl) {
      previewEl.innerHTML = formatXml(serialiseImportTourists(state.tourists));
    }
  }, 120);
}

/* ─────────────────────────── Tourist card ─────────────────────────── */

type CardOptions = { mode: Mode; labelEyebrow: string };

function shouldShowError(
  state: AppState,
  id: string,
  field: keyof Tourist,
): boolean {
  return (
    state.ui.submitAttempted || state.ui.touched.has(`${id}::${String(field)}`)
  );
}

function renderTouristCard(
  state: AppState,
  t: Tourist,
  handlers: Handlers,
  opts: CardOptions,
): HTMLElement {
  const article = document.createElement("article");
  article.className = "guest-card";
  article.dataset["id"] = t.id;

  // Guests see only required fields; hosts see optional fields too.
  const identityFields =
    opts.mode === "guest"
      ? IDENTITY_FIELDS.filter((f) => f.required)
      : IDENTITY_FIELDS;

  article.innerHTML = `
    <header class="guest-header">
      <div>
        <span class="guest-eyebrow">${escapeAttr(opts.labelEyebrow)}</span>
        <h3 class="guest-name"></h3>
        <p class="guest-sub" hidden></p>
      </div>
      <div class="guest-header-actions">
        <span class="guest-chip-slot"></span>
        <button type="button" class="btn btn-danger btn-small" data-action="remove">${opts.mode === "guest" ? "Remove" : "Remove guest"}</button>
      </div>
    </header>
    <div class="guest-hint-slot"></div>
    <section class="guest-section">
      <h4 class="section-title">${opts.mode === "guest" ? "About you" : "Who is the guest"}</h4>
      <div class="form-grid">
        ${renderGender(t)}
        ${identityFields.map((f) => renderField(t, f)).join("")}
      </div>
    </section>
    ${section("Travel document", DOC_FIELDS, t)}
    ${section("Stay dates", STAY_FIELDS, t)}
    ${opts.mode === "host" ? section("Tax and arrival", TAX_FIELDS, t) : ""}
    ${
      opts.mode === "host"
        ? `<details class="more-options">
             <summary>More options <span class="chev" aria-hidden="true">›</span></summary>
             ${section("", EXTRA_FIELDS, t)}
           </details>`
        : ""
    }
  `;

  const onFieldEvent = (e: Event) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const name = target.name;
    if (!name) return;
    let value = target.value;
    if ((target as HTMLElement).dataset["datemask"] !== undefined) {
      value = maskDate(value);
      target.value = value;
    } else if ((target as HTMLElement).dataset["country"] !== undefined) {
      value = resolveCountryCode(value);
    }
    handlers.onTouristChange(t.id, { [name]: value } as Partial<Tourist>);
  };
  article.addEventListener("input", onFieldEvent);
  article.addEventListener("change", onFieldEvent);

  // Reveal a field's error only once the user leaves it (blur), and tidy up a
  // country name to its canonical spelling at the same time.
  article.addEventListener("focusout", (e) => {
    const target = e.target as HTMLElement;
    const label = target.closest<HTMLElement>("[data-field]");
    if (!label) return;
    const field = label.dataset["field"] as keyof Tourist | undefined;
    if (!field) return;
    if (
      (target as HTMLInputElement).dataset?.["country"] !== undefined &&
      "value" in target
    ) {
      const canonical = countryName(
        resolveCountryCode((target as HTMLInputElement).value),
      );
      if (canonical) (target as HTMLInputElement).value = canonical;
    }
    handlers.onTouristBlur(t.id, field);
  });

  article.querySelectorAll<HTMLButtonElement>("[data-gender]").forEach((b) => {
    b.addEventListener("click", () => {
      handlers.onTouristChange(t.id, {
        gender: b.dataset["gender"] as Tourist["gender"],
      });
      handlers.onTouristBlur(t.id, "gender");
    });
  });
  article
    .querySelector<HTMLButtonElement>("[data-action='remove']")!
    .addEventListener("click", () => handlers.onRemoveTourist(t.id));

  // Fill in the validation-dependent bits (header, chips, errors) now that the
  // skeleton exists.
  applyCardState(state, article, t, opts.mode);

  return article;
}

function section(title: string, fields: FieldDef[], t: Tourist): string {
  const heading = title ? `<h4 class="section-title">${title}</h4>` : "";
  const fieldsHtml = fields.map((f) => renderField(t, f)).join("");
  return `<section class="guest-section">
    ${heading}
    <div class="form-grid">${fieldsHtml}</div>
  </section>`;
}

/* ──────────────── In-place card refresh (no DOM teardown) ──────────────── */

/**
 * The heart of the focus fix. Given an existing card element, update only the
 * header text, chips, hint, and per-field error state, never the inputs the
 * user is typing in. Querying within `root` (not the document) means it works
 * on a card that hasn't been attached yet, so the build path can reuse it.
 */
export function applyCardState(
  state: AppState,
  root: HTMLElement,
  t: Tourist,
  mode: Mode,
): void {
  const { errors } = validateTourist(t, mode);
  const errorByField = new Map<keyof Tourist, string>();
  for (const e of errors) errorByField.set(e.field, e.message);

  // Header name + subline.
  const nameEl = root.querySelector<HTMLElement>(".guest-name");
  if (nameEl) nameEl.textContent = guestDisplayName(t);
  const subEl = root.querySelector<HTMLElement>(".guest-sub");
  if (subEl) {
    const sub = guestSubline(t);
    subEl.textContent = sub;
    subEl.hidden = !sub;
  }

  // Sex pills. renderGender stamps aria-pressed once when the card is built,
  // but the card refreshes in place to keep focus, so nothing ever updated it
  // again: clicking Male or Female set the value and left both pills looking
  // unselected. The pressed state is what the stylesheet colours, so the
  // control appeared not to work at all.
  root.querySelectorAll<HTMLButtonElement>(".gender-pill").forEach((pill) => {
    pill.setAttribute("aria-pressed", String(pill.dataset["gender"] === t.gender));
  });

  // Per-field error + aria-invalid, gated on whether the field is "shown".
  let visibleErrors = 0;
  root.querySelectorAll<HTMLElement>("[data-field]").forEach((label) => {
    const field = label.dataset["field"] as keyof Tourist;
    const control = label.querySelector<HTMLElement>(
      ".field-input, .field-select, .gender-group",
    );
    const errEl = label.querySelector<HTMLElement>(".field-error");
    const show = shouldShowError(state, t.id, field);
    const msg = show ? errorByField.get(field) ?? "" : "";
    if (msg) visibleErrors += 1;
    if (errEl) {
      errEl.textContent = msg;
      errEl.hidden = !msg;
    }
    if (control) control.setAttribute("aria-invalid", msg ? "true" : "false");
  });

  // Status chip: reassuring before the user has touched anything.
  const chipSlot = root.querySelector<HTMLElement>(".guest-chip-slot");
  if (chipSlot) {
    if (errors.length === 0) {
      chipSlot.innerHTML = `<span class="chip chip-ok">Looks good</span>`;
    } else if (visibleErrors > 0) {
      chipSlot.innerHTML = `<span class="chip chip-error">${visibleErrors} to fill in</span>`;
    } else {
      chipSlot.innerHTML = `<span class="chip">In progress</span>`;
    }
  }

  // Host-only nudge to finish the property/tax fields.
  const hintSlot = root.querySelector<HTMLElement>(".guest-hint-slot");
  if (hintSlot) {
    const needsHostInfo =
      mode === "host" &&
      (!t.facility || !t.ttPaymentCategory || !t.arrivalOrganisation);
    hintSlot.innerHTML = needsHostInfo
      ? `<p class="guest-hint">Add the tax category and arrival code below to finish this guest.</p>`
      : "";
  }
}

/** Refresh a single card in place (used on every keystroke / blur). */
export function refreshTourist(state: AppState, id: string): void {
  const root = document.querySelector<HTMLElement>(
    `.guest-card[data-id="${id}"]`,
  );
  const t = state.tourists.find((x) => x.id === id);
  if (root && t) applyCardState(state, root, t, state.mode ?? "host");
  refreshDerived(state);
}

/* ─────────────────────────── Fields ─────────────────────────── */

function renderField(t: Tourist, f: FieldDef): string {
  // escapeAttr even though ids are sanitised at the parser/storage boundary.
  // this string lands in id=, for= and aria-describedby, so it should not rely
  // on a caller elsewhere having cleaned it.
  const id = escapeAttr(`t-${t.id}-${String(f.key)}`);
  const value = String(t[f.key] ?? "");
  const describedBy = `${id}-help ${id}-error`;

  let control = "";
  if (f.control === "country") {
    control = renderCountryCombo(id, f.key, value, describedBy);
  } else if (f.key === "dateOfBirth") {
    // A masked free-text field. Native date pickers are miserable for a
    // birthday decades in the past.
    control = `<input id="${id}" class="field-input" type="text" inputmode="numeric"
              name="${String(f.key)}" data-datemask maxlength="10" placeholder="YYYY-MM-DD"
              value="${escapeAttr(value)}" aria-invalid="false" aria-describedby="${describedBy}" />`;
  } else if (f.control === "documentType") {
    control = `<select id="${id}" class="field-select" name="${String(f.key)}" aria-invalid="false" aria-describedby="${describedBy}">
      ${DOCUMENT_TYPES.map((d) => `<option value="${escapeAttr(d.code)}" ${d.code === value ? "selected" : ""}>${escapeAttr(d.label)}</option>`).join("")}
    </select>`;
  } else if (f.control === "payment") {
    control = `<select id="${id}" class="field-select" name="${String(f.key)}" aria-invalid="false" aria-describedby="${describedBy}">
      <option value="">Choose a category…</option>
      ${PAYMENT_CATEGORIES.map((p) => `<option value="${escapeAttr(p)}" ${p === value ? "selected" : ""}>${escapeAttr(p)}</option>`).join("")}
    </select>`;
  } else {
    control = `<input id="${id}" class="field-input" type="${f.type}" name="${String(f.key)}"
              placeholder="${escapeAttr(f.placeholder ?? "")}"
              value="${escapeAttr(value)}" aria-invalid="false" aria-describedby="${describedBy}" />`;
  }

  return fieldShell({ id, label: f.label, help: f.help, control, field: f.key, startsRow: f.startsRow });
}

function renderCountryCombo(
  id: string,
  name: keyof Tourist,
  code: string,
  describedBy: string,
): string {
  const display = code ? countryName(code) ?? code : "";
  return `<input id="${id}" class="field-input" type="text" name="${String(name)}"
    list="country-list" data-country autocomplete="off" placeholder="Start typing a country…"
    value="${escapeAttr(display)}" aria-invalid="false" aria-describedby="${describedBy}" />`;
}

function renderGender(t: Tourist): string {
  const id = escapeAttr(`t-${t.id}-gender`);
  return fieldShell({
    id,
    label: "Sex (as on document)",
    help: "Pick the option that matches the travel document.",
    field: "gender",
    control: `
      <div class="gender-group" role="group" aria-invalid="false" aria-describedby="${id}-help ${id}-error">
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
  field?: keyof Tourist;
  startsRow?: boolean;
};

function fieldShell({ id, label, help, control, field, startsRow }: ShellArgs): string {
  const helpId = `${id}-help`;
  const errId = `${id}-error`;
  return `
    <label class="field${startsRow ? " field-row-start" : ""}" for="${id}"${field ? ` data-field="${String(field)}"` : ""}>
      <span class="field-label-row">
        <span class="field-label">${escapeAttr(label)}</span>
        <button type="button" class="help-btn" aria-controls="${helpId}" aria-expanded="false"
                aria-label="Help: ${escapeAttr(label)}" data-help-toggle>?</button>
      </span>
      ${control}
      <span id="${helpId}" class="field-help" hidden>${escapeAttr(help)}</span>
      <span id="${errId}" class="field-error" role="alert" hidden></span>
    </label>
  `;
}

/* ─────────────────────────── File preview ─────────────────────────── */

function formatXml(xml: string): string {
  return xml
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
  return name || "New entry";
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

/* keep the named export shape the test suite / main use */
export { $ };
