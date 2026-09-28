/**
 * "Has this browser voted today?" (anti-herding, 2026-09-28). The community
 * view (order, counts, reasons, resonance) unlocks only after a voter has made
 * an independent choice. Browser-only helpers; every storage access is wrapped
 * so privacy mode degrades to the locked view instead of crashing.
 */

const VOTED_KEY = "benchmark:voted";
const EMAIL_KEY = "benchmark:email";

/** Today's date in Asia/Taipei (UTC+8, no DST) as YYYY-MM-DD. */
export function taipeiDate(now: number = Date.now()): string {
  return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
}

/** True when a ballot was cast (or confirmed) in this browser today. */
export function votedTodayLocal(): boolean {
  try {
    return window.localStorage.getItem(VOTED_KEY) === taipeiDate();
  } catch {
    return false;
  }
}

/** Remember that this browser has voted today (Taipei date). */
export function markVotedToday(): void {
  try {
    window.localStorage.setItem(VOTED_KEY, taipeiDate());
  } catch {
    /* storage unavailable: the view simply stays locked on the next load */
  }
}

/** The remembered participant email, or "". */
export function savedEmail(): string {
  try {
    return window.localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * `/vote`, keeping the owner preview (`preview` + `key`) when the current
 * page carries both, so the preview flow survives the click.
 */
export function voteHrefFrom(
  params: Record<string, string | string[] | undefined> | undefined,
): string {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const preview = one(params?.preview);
  const key = one(params?.key);
  if (!preview || !key) return "/vote";
  const q = new URLSearchParams({ preview, key });
  return `/vote?${q.toString()}`;
}
