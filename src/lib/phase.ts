import type { Phase, Stats } from "@/lib/types";

/**
 * Phase gating (spec v6 §1). Campaign memo v4.0: Phase 1 only collects
 * nominations and must not reveal the later story. Every later-phase block is
 * gated with this helper instead of being deleted.
 *
 * - `story`    ximu, IQ Lite / IQ Elite, pricing, AI Representation wording,
 *              Why It Matters, SEE/COMPARE/DECIDE, Top 3 prize, Your Market,
 *              partner strip — results only.
 * - `schedule` vote dates, results date, Top 3 / Top 10, Shortlist, voting
 *              steps — from the vote phase on.
 */
export function reveal(phase: Phase): { story: boolean; schedule: boolean } {
  return {
    story: phase === "results",
    schedule: phase === "vote" || phase === "closed" || phase === "results",
  };
}

/** Pre and nominate render the Phase 1 site (spec v6 §3–4). */
export function isPhaseOne(phase: Phase): boolean {
  return phase === "pre" || phase === "nominate";
}

/**
 * Stats as Phase 1 may ship them to the browser. Client components serialize
 * their props into the page's RSC payload, so later-phase settings (vote
 * dates, results label, ximu / IQ Lite links, partners) are blanked here
 * rather than merely not rendered.
 */
export function phaseOneStats(stats: Stats): Stats {
  if (!isPhaseOne(stats.phase)) return stats;
  const {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    iqlite_url,
    ximu_url,
    partners_text,
    /* eslint-enable @typescript-eslint/no-unused-vars */
    contact_email,
    ...rest
  } = stats;
  // Product keys are absent at runtime. The schedule (vote dates, results
  // label) stays: the owner asked for the full timeline on the phase-1 home.
  return {
    ...rest,
    contact_email: /ximu/i.test(contact_email) ? "" : contact_email,
  } as Stats;
}

const PHASES: readonly Phase[] = ["pre", "nominate", "vote", "closed", "results"];

/**
 * Local preview override (spec v7b §7). `PREVIEW_PHASE` is honoured only
 * outside Vercel production, and on a production build (`next start`) only
 * with `ALLOW_PREVIEW=1` as well. The env object is read at runtime on
 * purpose, so the guard cannot be folded away at build time.
 */
export function previewPhase(
  env: Record<string, string | undefined> = process.env,
): Phase | null {
  if (env.VERCEL_ENV === "production") return null;
  if (env.NODE_ENV === "production" && env.ALLOW_PREVIEW !== "1") return null;
  const wanted = env.PREVIEW_PHASE as Phase | undefined;
  return wanted && PHASES.includes(wanted) ? wanted : null;
}

/** Stats with the preview phase applied (no-op in production). */
export function withPreview(stats: Stats): Stats {
  const p = previewPhase();
  return p ? { ...stats, phase: p } : stats;
}

/** Vote and closed render the Community Intelligence page (spec v7b §1, §4). */
export function isVotePhase(phase: Phase): boolean {
  return phase === "vote" || phase === "closed";
}

/**
 * Stats as the vote / closed pages may ship them to the browser. Memo v3.0
 * revokes the Phase 1 rule that hid ximu, so `ximu_url` now ships; the IQ Lite
 * link and the partner text stay blank until results.
 */
export function publicStats(stats: Stats): Stats {
  if (isPhaseOne(stats.phase)) return phaseOneStats(stats);
  if (stats.phase === "results") return stats;
  const {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    iqlite_url,
    partners_text,
    /* eslint-enable @typescript-eslint/no-unused-vars */
    contact_email,
    ...rest
  } = stats;
  // Keys removed, not blanked: client props are serialized into the page.
  return {
    ...rest,
    contact_email: /ximu/i.test(contact_email) ? "" : contact_email,
  } as Stats;
}

/**
 * Owner preview on production: `?preview=<phase>&key=<PREVIEW_KEY>` renders any
 * phase for whoever holds the key. Nothing changes for ordinary visitors, and
 * writes still obey the real phase in the database.
 */
export function previewFromQuery(
  params: Record<string, string | string[] | undefined> | undefined,
  env: Record<string, string | undefined> = process.env,
): Phase | null {
  const key = env.PREVIEW_KEY;
  if (!key || !params) return null;
  const given = Array.isArray(params.key) ? params.key[0] : params.key;
  if (given !== key) return null;
  const raw = Array.isArray(params.preview) ? params.preview[0] : params.preview;
  return raw && PHASES.includes(raw as Phase) ? (raw as Phase) : null;
}

/**
 * Phase One stats for `/` in every phase (owner, 2026-09-27: Phase One and
 * Phase Two live on different URLs). `/` never shows the later story, so the
 * Phase 1 blanking applies even after nominations close.
 */
export function nominationStats(stats: Stats): Stats {
  if (isPhaseOne(stats.phase)) return phaseOneStats(stats);
  return { ...phaseOneStats({ ...stats, phase: "nominate" }), phase: stats.phase };
}

/**
 * Is Phase Two public right now? `effective_phase()` already says 'vote'
 * from `vote_open`, but between `nominate_close` (09-27 23:59) and
 * `vote_open` (09-28 12:00) it says 'closed' too — that gap is NOT Phase Two.
 * 'closed' only counts once `vote_open` has passed (voting over).
 */
export function phaseTwoOpen(
  stats: Pick<Stats, "phase" | "vote_open">,
  now: number = Date.now(),
): boolean {
  if (stats.phase === "vote" || stats.phase === "results") return true;
  if (stats.phase !== "closed") return false;
  const t = stats.vote_open ? Date.parse(stats.vote_open) : NaN;
  return Number.isFinite(t) && now >= t;
}

/** Path of the Phase Two home (owner, 2026-09-27). `/` stays Phase One. */
export const PHASE_TWO_PATH = "/phase-two";

/**
 * Gate for every Phase Two route (`/phase-two`, `/vote`, `/candidates…`,
 * `/company/…`). A valid owner preview (`?preview=vote|closed|results&key=`)
 * opens it early; otherwise it opens with {@link phaseTwoOpen}.
 */
export function phaseTwoGate(
  loaded: Stats,
  params: Record<string, string | string[] | undefined> | undefined,
): { stats: Stats; open: boolean } {
  const preview = previewFromQuery(params);
  if (preview) {
    return {
      stats: { ...loaded, phase: preview },
      open: preview === "vote" || preview === "closed" || preview === "results",
    };
  }
  return { stats: loaded, open: phaseTwoOpen(loaded) };
}
