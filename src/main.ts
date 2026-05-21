import {
  blankTourist,
  clearMode,
  clearSettings,
  createInitialState,
  loadSettings,
  saveMode,
  saveSettings,
  sampleTourist,
} from "./state.ts";
import { renderForMode } from "./render.ts";
import { serialiseImportTourists } from "./xml.ts";
import { validateTourist } from "./validation.ts";
import { ImportError, parseTouristsXml } from "./parser.ts";
import type { AppState, Mode, Settings, Tourist } from "./types.ts";

const state: AppState = createInitialState();

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
    render();
  },
  onTouristChange(id: string, patch: Partial<Tourist>) {
    const idx = state.tourists.findIndex((t) => t.id === id);
    if (idx < 0) return;
    state.tourists[idx] = { ...state.tourists[idx]!, ...patch };
    render();
  },
  onRemoveTourist(id: string) {
    state.tourists = state.tourists.filter((t) => t.id !== id);
    if (state.tourists.length === 0) state.tourists.push(blankTourist(state.settings));
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
  for (const t of state.tourists) {
    if (!validateTourist(t, mode).ok) return;
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
  flashStatus(
    mode === "guest"
      ? "Saved. Send the file to your host by email or any other way."
      : "Saved. Upload it on eVisitor under Turisti → Prijava putem datoteke.",
  );
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

function wireGlobalActions(): void {
  // Host: add by hand
  document.getElementById("btn-add")?.addEventListener("click", () => {
    state.tourists.push(blankTourist(state.settings));
    render();
    scrollIntoLastGuest("#tourist-list");
  });
  // Host: duplicate
  document.getElementById("btn-duplicate")?.addEventListener("click", () => {
    const last = state.tourists.at(-1);
    state.tourists.push(
      last ? { ...last, id: crypto.randomUUID() } : blankTourist(state.settings),
    );
    render();
    scrollIntoLastGuest("#tourist-list");
  });
  // Host: example data
  document.getElementById("btn-sample")?.addEventListener("click", () => {
    state.tourists.push(sampleTourist(state.settings));
    render();
    scrollIntoLastGuest("#tourist-list");
  });
  // Host: clear guests
  document.getElementById("btn-reset")?.addEventListener("click", () => {
    if (!confirm("Clear all guests on this device? Your property details are kept.")) return;
    state.tourists = [blankTourist(state.settings)];
    render();
  });

  // Guest: add another person
  document.getElementById("btn-add-guest")?.addEventListener("click", () => {
    state.tourists.push(blankTourist(state.settings));
    render();
    scrollIntoLastGuest("#guest-tourist-list");
  });
  document.getElementById("btn-duplicate-guest")?.addEventListener("click", () => {
    const last = state.tourists.at(-1);
    state.tourists.push(
      last ? { ...last, id: crypto.randomUUID() } : blankTourist(state.settings),
    );
    render();
    scrollIntoLastGuest("#guest-tourist-list");
  });
  document.getElementById("btn-reset-guest")?.addEventListener("click", () => {
    if (!confirm("Clear everyone you've entered?")) return;
    state.tourists = [blankTourist(state.settings)];
    render();
  });

  // Downloads
  document.getElementById("btn-download")?.addEventListener("click", downloadFile);
  document.getElementById("btn-guest-download")?.addEventListener("click", downloadFile);
  document.getElementById("btn-download-sticky")?.addEventListener("click", downloadFile);

  // Privacy: clear stored property defaults + role
  document.getElementById("btn-clear-storage")?.addEventListener("click", () => {
    if (!confirm("Forget your property defaults and role on this device?")) return;
    clearSettings();
    clearMode();
    state.mode = null;
    state.settings = loadSettings();
    state.tourists = [blankTourist(state.settings)];
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
  last?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function boot(): void {
  wireModeChooser();
  wireGlobalActions();
  wireSettingsDelegate();
  wireImport();
  wireHelpToggles();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
