import {
  blankTourist,
  createInitialState,
  saveSettings,
  sampleTourist,
} from "./state.ts";
import {
  renderCountryDatalist,
  renderSettings,
  renderTouristList,
  renderXmlPreview,
} from "./render.ts";
import { serialiseImportTourists } from "./xml.ts";
import { validateTourist } from "./validation.ts";
import type { AppState, Settings, Tourist } from "./types.ts";

const state: AppState = createInitialState();

function render(): void {
  renderSettings(state, handlers);
  renderTouristList(state, handlers);
  renderXmlPreview(serialiseImportTourists(state.tourists));
}

const handlers = {
  onSettingsChange(patch: Partial<Settings>) {
    state.settings = { ...state.settings, ...patch };
    saveSettings(state.settings);

    // Sync defaults onto rows that haven't been hand-edited.
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

function downloadXml(): void {
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
}

function filenameForToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `TouristCheckIns-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.xml`;
}

async function copyXml(): Promise<void> {
  const xml = serialiseImportTourists(state.tourists);
  try {
    await navigator.clipboard.writeText(xml);
    flashStatus("Copied XML to clipboard.");
  } catch {
    flashStatus("Couldn't access clipboard.");
  }
}

function flashStatus(message: string): void {
  const el = document.querySelector("#download-status");
  if (!el) return;
  const previous = el.textContent;
  el.textContent = message;
  window.setTimeout(() => {
    if (el.textContent === message) el.textContent = previous ?? "";
  }, 1800);
}

function wireGlobalActions(): void {
  document.querySelector("#btn-add")!.addEventListener("click", () => {
    state.tourists.push(blankTourist(state.settings));
    render();
  });

  document.querySelector("#btn-duplicate")!.addEventListener("click", () => {
    const last = state.tourists.at(-1);
    if (!last) {
      state.tourists.push(blankTourist(state.settings));
    } else {
      state.tourists.push({ ...last, id: crypto.randomUUID() });
    }
    render();
  });

  document.querySelector("#btn-sample")!.addEventListener("click", () => {
    state.tourists.push(sampleTourist(state.settings));
    render();
  });

  document.querySelector("#btn-reset")!.addEventListener("click", () => {
    if (!confirm("Clear all guests on this device? Settings are kept.")) return;
    state.tourists = [blankTourist(state.settings)];
    render();
  });

  document.querySelector("#btn-download")!.addEventListener("click", downloadXml);
  document.querySelector("#btn-copy")!.addEventListener("click", () => {
    void copyXml();
  });

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      downloadXml();
    }
  });
}

function boot(): void {
  renderCountryDatalist();
  wireGlobalActions();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
