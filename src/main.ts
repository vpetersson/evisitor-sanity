import {
  blankTourist,
  createInitialState,
  saveSettings,
  sampleTourist,
} from "./state.ts";
import { renderAll } from "./render.ts";
import { serialiseImportTourists } from "./xml.ts";
import { validateTourist } from "./validation.ts";
import type { AppState, Settings, Tourist } from "./types.ts";

const state: AppState = createInitialState();

const handlers = {
  onSettingsChange(patch: Partial<Settings>) {
    state.settings = { ...state.settings, ...patch };
    saveSettings(state.settings);

    // Cascade newly entered defaults onto any guest rows that haven't been
    // hand-edited away from the previous default.
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
  renderAll(state, handlers);
}

function downloadFile(): void {
  for (const t of state.tourists) {
    if (!validateTourist(t).ok) return;
  }
  const xml = serialiseImportTourists(state.tourists);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filenameForToday();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  flashStatus("File saved. Upload it on eVisitor under Turisti → Prijava putem datoteke.");
}

function filenameForToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `TouristCheckIns-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.xml`;
}

function flashStatus(message: string): void {
  const el = document.querySelector("#download-status");
  if (!el) return;
  const previous = el.textContent;
  el.textContent = message;
  window.setTimeout(() => {
    if (el.textContent === message) el.textContent = previous ?? "";
  }, 3000);
}

function wireGlobalActions(): void {
  document.querySelector("#btn-add")!.addEventListener("click", () => {
    state.tourists.push(blankTourist(state.settings));
    render();
    scrollIntoLastGuest();
  });

  document.querySelector("#btn-duplicate")!.addEventListener("click", () => {
    const last = state.tourists.at(-1);
    if (!last) {
      state.tourists.push(blankTourist(state.settings));
    } else {
      state.tourists.push({ ...last, id: crypto.randomUUID() });
    }
    render();
    scrollIntoLastGuest();
  });

  document.querySelector("#btn-sample")!.addEventListener("click", () => {
    state.tourists.push(sampleTourist(state.settings));
    render();
    scrollIntoLastGuest();
  });

  document.querySelector("#btn-reset")!.addEventListener("click", () => {
    if (!confirm("Clear all guests on this device? Your property details are kept.")) return;
    state.tourists = [blankTourist(state.settings)];
    render();
  });

  document.querySelector("#btn-download")!.addEventListener("click", downloadFile);
  document.querySelector("#btn-download-sticky")!.addEventListener("click", downloadFile);
}

function wireSettingsDelegate(): void {
  const root = document.querySelector<HTMLElement>("#settings-fields");
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
    if (willOpen) {
      help.removeAttribute("hidden");
    } else {
      help.setAttribute("hidden", "");
    }
    btn.setAttribute("aria-expanded", String(willOpen));
  });
}

function scrollIntoLastGuest(): void {
  const list = document.querySelector("#tourist-list");
  if (!list) return;
  const last = list.lastElementChild as HTMLElement | null;
  last?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function boot(): void {
  wireGlobalActions();
  wireSettingsDelegate();
  wireHelpToggles();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
