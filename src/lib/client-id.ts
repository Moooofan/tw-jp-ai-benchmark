/**
 * A per-browser id (v6f), exact copy of NominateClient's `clientId()` helper
 * so Phase 2 picks tag the same way Phase 1 nominations do. Kept as its own
 * module (not imported by NominateClient) so Phase 1 stays byte-identical —
 * duplication here is the deliberate, accepted trade-off.
 */
const CID_KEY = "benchmark:cid";

export function clientId(): string {
  if (typeof window === "undefined") {
    // SSR: never persisted, just a throwaway id so callers don't need to
    // special-case the server render.
    return `s-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
  try {
    const got = window.localStorage.getItem(CID_KEY);
    if (got) return got;
    const made =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `r-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(CID_KEY, made);
    return made;
  } catch {
    // private mode / storage blocked: still return an id, just not a stable one.
    return `r-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}
