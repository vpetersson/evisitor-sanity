import {
  blankTourist,
  clearMode,
  clearSettings,
  clearTourists,
  createInitialState,
  loadSettings,
  saveMode,
  saveSettings,
  saveTourists,
  sampleTourist,
} from "./state.ts";
import { refreshTourist, renderForMode } from "./render.ts";
import { serialiseImportTourists } from "./xml.ts";
import { validateTourist } from "./validation.ts";
import { ImportError, parseTouristsXml } from "./parser.ts";
import type { AppState, Mode, Settings, Tourist } from "./types.ts";

const state: AppState = createInitialState();

// A ?role=guest (or ?role=host) URL parameter lets a host send a single link
// to their guest that lands directly in the guest form.
const roleFromUrl = new URLSearchParams(window.location.search).get("role");
if (roleFromUrl === "guest" || roleFromUrl === "host") {
  state.mode = roleFromUrl;
  saveMode(roleFromUrl);
}

// Set once the guest/host has typed something worth keeping, cleared after a
// successful save. Drives the close-tab warning.
let dirty = false;
function markDirty(): void {
  dirty = true;
}

const handlers = {
  onSettingsChange(patch: Partial<Settings>) {
    state.settings = { ...state.settings, ...patch };
    saveSettings(state.settings);
    if (patch.facility !== undefined) {
      for (const t of state.tourists) if (!t.facility) t.facility = patch.facility;
    }
    if (patch.defaultArrivalOrg !== undefined) {
      for (const t of state.tourists)
        if (!t.arrivalOrganisation) t.arrivalOrganisation = patch.defaultArrivalOrg;
    }
    if (patch.agencyOib !== undefined) {
      for (const t of state.tourists)
        if (!t.touristAgency) t.touristAgency = patch.agencyOib;
    }
    saveTourists(state.tourists);
    // A full render is fine here: focus lives in a settings input, which
    // renderSettings preserves; only the (unfocused) guest cards rebuild.
    render();
  },
  onTouristChange(id: string, patch: Partial<Tourist>) {
    const idx = state.tourists.findIndex((t) => t.id === id);
    if (idx < 0) return;
    state.tourists[idx] = { ...state.tourists[idx]!, ...patch };
    markDirty();
    saveTourists(state.tourists);
    // In-place refresh ONLY — never rebuild the card the user is typing into.
    refreshTourist(state, id);
  },
  onTouristBlur(id: string, field: keyof Tourist) {
    state.ui.touched.add(`${id}::${String(field)}`);
    refreshTourist(state, id);
  },
  onRemoveTourist(id: string) {
    state.tourists = state.tourists.filter((t) => t.id !== id);
    if (state.tourists.length === 0) state.tourists.push(blankTourist(state.settings));
    saveTourists(state.tourists);
    render();
  },
};

function render(): void {
  renderForMode(state, handlers);
}

function currentMode(): Mode {
  return state.mode ?? "host";
}

/* ─────────────────────────── Downloads ─────────────────────────── */

function downloadFile(): void {
  const mode = currentMode();
  const hasErrors = state.tourists.some((t) => !validateTourist(t, mode).ok);
  if (hasErrors) {
    // Don't silently do nothing — reveal every error and walk the user to the
    // first one. This replaces the old dead, disabled button.
    state.ui.submitAttempted = true;
    render();
    focusFirstError();
    flashStatus("Please fill in the highlighted fields, then save again.");
    return;
  }

  const xml = serialiseImportTourists(state.tourists);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filenameForToday(mode);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  dirty = false; // the work is safely on disk now
  flashStatus(
    mode === "guest"
      ? "Saved. Send the file to your host by email or any other way."
      : "Saved. Upload it on eVisitor under Turisti → Prijava putem datoteke.",
  );
}

function focusFirstError(): void {
  const first = document.querySelector<HTMLElement>(
    '.guest-card [aria-invalid="true"]',
  );
  if (!first) return;
  first.scrollIntoView({ behavior: "smooth", block: "center" });
  // The country/text inputs and the gender group are all focusable.
  (first.matches("input, select")
    ? first
    : first.querySelector<HTMLElement>("button, input, select") ?? first
  ).focus({ preventScroll: true });
}

function filenameForToday(mode: Mode): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  return mode === "guest"
    ? `GuestDetails-${stamp}.xml`
    : `TouristCheckIns-${stamp}.xml`;
}

function flashStatus(message: string): void {
  const ids = ["#download-status", "#guest-download-status"] as const;
  for (const id of ids) {
    const el = document.querySelector(id);
    if (!el) continue;
    const previous = el.textContent;
    el.textContent = message;
    window.setTimeout(() => {
      if (el.textContent === message) el.textContent = previous ?? "";
    }, 3500);
  }
}

/* ─────────────────────────── Mode handling ─────────────────────────── */

function setMode(mode: Mode): void {
  state.mode = mode;
  saveMode(mode);
  // Ensure the host gets a fresh blank guest row when first switching;
  // the guest gets one blank "themselves" row.
  if (state.tourists.length === 0) {
    state.tourists.push(blankTourist(state.settings));
  }
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wireModeChooser(): void {
  document
    .querySelectorAll<HTMLButtonElement>("[data-pick-mode]")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset["pickMode"] as Mode | undefined;
        if (mode === "guest" || mode === "host") setMode(mode);
      });
    });

  document
    .querySelectorAll<HTMLButtonElement>(".mode-toggle-btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.dataset["mode"] as Mode | undefined;
        if (mode === "guest" || mode === "host") setMode(mode);
      });
    });
}

/* ─────────────────────────── Import ─────────────────────────── */

function wireImport(): void {
  const input = document.getElementById("import-input") as HTMLInputElement | null;
  if (!input) return;
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = parseTouristsXml(text);
      // Apply host defaults to imported rows where appropriate
      for (const t of imported) {
        if (!t.facility) t.facility = state.settings.facility;
        if (!t.arrivalOrganisation) t.arrivalOrganisation = state.settings.defaultArrivalOrg;
        if (!t.touristAgency) t.touristAgency = state.settings.agencyOib;
      }
      // Replace any single empty placeholder; otherwise append
      const lastIsBlank =
        state.tourists.length === 1 &&
        !state.tourists[0]!.touristName &&
        !state.tourists[0]!.touristSurname;
      if (lastIsBlank) state.tourists = imported;
      else state.tourists.push(...imported);

      markDirty();
      saveTourists(state.tourists);
      flashImportStatus(
        `Imported ${imported.length} guest${imported.length === 1 ? "" : "s"} from ${file.name}.`,
        "ok",
      );
      render();
    } catch (err) {
      const message =
        err instanceof ImportError
          ? err.message
          : "Sorry, we couldn't read that file.";
      flashImportStatus(message, "error");
    } finally {
      input.value = "";
    }
  });
}

function flashImportStatus(message: string, kind: "ok" | "error"): void {
  const el = document.getElementById("import-status");
  if (!el) return;
  el.textContent = message;
  el.className = `reassurance ${kind === "error" ? "reassurance-error" : "reassurance-ok"}`;
  window.setTimeout(() => {
    if (el.textContent === message) {
      el.textContent = "";
      el.className = "reassurance";
    }
  }, 5000);
}

/* ─────────────────────────── Other actions ─────────────────────────── */

function addTourist(t: Tourist, listSelector: string): void {
  state.tourists.push(t);
  markDirty();
  saveTourists(state.tourists);
  render();
  scrollIntoLastGuest(listSelector);
}

function resetTourists(): void {
  state.tourists = [blankTourist(state.settings)];
  state.ui.touched.clear();
  state.ui.submitAttempted = false;
  dirty = false;
  saveTourists(state.tourists);
  render();
}

function duplicateLast(): Tourist {
  const last = state.tourists.at(-1);
  return last ? { ...last, id: crypto.randomUUID() } : blankTourist(state.settings);
}

function wireGlobalActions(): void {
  // Host: add by hand
  document.getElementById("btn-add")?.addEventListener("click", () => {
    addTourist(blankTourist(state.settings), "#tourist-list");
  });
  // Host: duplicate
  document.getElementById("btn-duplicate")?.addEventListener("click", () => {
    addTourist(duplicateLast(), "#tourist-list");
  });
  // Host: example data
  document.getElementById("btn-sample")?.addEventListener("click", () => {
    addTourist(sampleTourist(state.settings), "#tourist-list");
  });
  // Host: clear guests
  document.getElementById("btn-reset")?.addEventListener("click", () => {
    if (!confirm("Clear all guests on this device? Your property details are kept.")) return;
    resetTourists();
  });

  // Guest: add another person
  document.getElementById("btn-add-guest")?.addEventListener("click", () => {
    addTourist(blankTourist(state.settings), "#guest-tourist-list");
  });
  document.getElementById("btn-duplicate-guest")?.addEventListener("click", () => {
    addTourist(duplicateLast(), "#guest-tourist-list");
  });
  document.getElementById("btn-reset-guest")?.addEventListener("click", () => {
    if (!confirm("Clear everyone you've entered?")) return;
    resetTourists();
  });

  // Downloads
  document.getElementById("btn-download")?.addEventListener("click", downloadFile);
  document.getElementById("btn-guest-download")?.addEventListener("click", downloadFile);
  document.getElementById("btn-download-sticky")?.addEventListener("click", downloadFile);

  // Host: share guest form link
  document.getElementById("btn-share-guest-link")?.addEventListener("click", async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("role", "guest");
    url.hash = "";
    const link = url.toString();
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Croatian check-in form",
          text: "Please fill in your check-in details for our stay and send the file back to me:",
          url: link,
        });
      } else {
        await navigator.clipboard.writeText(link);
        flashImportStatus("Link copied. Send it to your guests.", "ok");
      }
    } catch {
      // user cancelled the native share sheet, or clipboard refused
      flashImportStatus(`Copy this link: ${link}`, "ok");
    }
  });

  // Privacy: clear stored property defaults + role
  document.getElementById("btn-clear-storage")?.addEventListener("click", () => {
    if (!confirm("Forget your property defaults and role on this device?")) return;
    clearSettings();
    clearMode();
    clearTourists();
    state.mode = null;
    state.settings = loadSettings();
    state.tourists = [blankTourist(state.settings)];
    state.ui.touched.clear();
    state.ui.submitAttempted = false;
    dirty = false;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function wireSettingsDelegate(): void {
  const root = document.getElementById("settings-fields");
  if (!root) return;
  root.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.name) return;
    handlers.onSettingsChange({ [t.name]: t.value } as Partial<Settings>);
  });
}

function wireHelpToggles(): void {
  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const btn = target.closest<HTMLButtonElement>("[data-help-toggle]");
    if (!btn) return;
    e.preventDefault();
    const helpId = btn.getAttribute("aria-controls");
    if (!helpId) return;
    const help = document.getElementById(helpId);
    if (!help) return;
    const willOpen = help.hasAttribute("hidden");
    if (willOpen) help.removeAttribute("hidden");
    else help.setAttribute("hidden", "");
    btn.setAttribute("aria-expanded", String(willOpen));
  });
}

function scrollIntoLastGuest(selector: string): void {
  const list = document.querySelector(selector);
  if (!list) return;
  const last = list.lastElementChild as HTMLElement | null;
  if (!last) return;
  last.scrollIntoView({ behavior: "smooth", block: "start" });
  // Move focus into the new card so keyboard and screen-reader users land in
  // the right place instead of hunting for it.
  const firstField = last.querySelector<HTMLElement>(".field-input, .field-select");
  firstField?.focus({ preventScroll: true });
}

function wireUnloadGuard(): void {
  window.addEventListener("beforeunload", (e) => {
    // Entries survive a reload (sessionStorage), but closing the tab still wipes
    // them by design — so warn before that happens if there's unsaved work.
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

function boot(): void {
  wireModeChooser();
  wireGlobalActions();
  wireSettingsDelegate();
  wireImport();
  wireHelpToggles();
  wireUnloadGuard();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
