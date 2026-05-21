import { Window } from "happy-dom";

const win = new Window();
const g = globalThis as Record<string, unknown>;
if (!g["DOMParser"]) {
  g["DOMParser"] = win.DOMParser;
}
