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
    vote_open,
    vote_close,
    results_label,
    iqlite_url,
    ximu_url,
    partners_text,
    /* eslint-enable @typescript-eslint/no-unused-vars */
    contact_email,
    ...rest
  } = stats;
  // The later-phase keys are absent at runtime; nothing rendered in pre /
  // nominate reads them.
  return {
    ...rest,
    contact_email: /ximu/i.test(contact_email) ? "" : contact_email,
  } as Stats;
}
