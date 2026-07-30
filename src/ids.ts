/**
 * Row identifiers.
 *
 * A tourist's `id` is two things at once: an eVisitor `<ID>` value we serialise,
 * and the handle we build DOM ids from (`t-${id}-${field}`). That second use is
 * why the value cannot be trusted verbatim — an imported file's `<ID>` is
 * attacker-controlled, and interpolating it into markup let a crafted file add
 * arbitrary attributes to every field on the page.
 *
 * Legitimate files carry an id this app generated, so anything outside a
 * conservative identifier charset is malformed rather than meaningful, and is
 * replaced with a fresh id instead of being preserved.
 */

/** Conservative: safe inside an HTML attribute, and a valid HTML id (no spaces). */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,64}$/;

export function isSafeId(value: string): boolean {
  return SAFE_ID.test(value);
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Keep a well-formed id; replace anything else with a fresh one. */
export function coerceId(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  return isSafeId(trimmed) ? trimmed : newId();
}
