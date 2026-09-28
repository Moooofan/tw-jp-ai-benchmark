import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomeVote, { P2_SUB, P2_TITLE } from "@/components/HomeVote";
import { CAMPAIGN_ZH } from "@/components/SiteChrome";
import { isVotePhase, phaseTwoGate, publicStats, reveal } from "@/lib/phase";
import {
  loadReasonCorpus,
  loadSiteData,
  loadStats,
  loadVoteBoard,
} from "@/lib/site-data";
import { EMPTY_VOTE_BOARD } from "@/lib/types";
import { voteHrefFrom } from "@/lib/voted";
import { wordCloud } from "@/lib/wordcloud";

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Search;
}): Promise<Metadata> {
  const { open } = phaseTwoGate(await loadStats(), await searchParams);
  if (!open) return { robots: { index: false } };
  const title = `${P2_TITLE}｜${CAMPAIGN_ZH} Phase Two`;
  return {
    title,
    description: P2_SUB,
    alternates: { canonical: "/phase-two" },
    openGraph: { title, description: P2_SUB, type: "website", url: "/phase-two" },
    twitter: { card: "summary_large_image", title, description: P2_SUB },
  };
}

export const revalidate = 30;

/**
 * `/phase-two` — Phase Two home (owner, 2026-09-27). Not public before
 * `vote_open` (404) except through the owner preview key.
 */
export default async function PhaseTwoPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const sp = await searchParams;
  const loaded = await loadSiteData();
  const { stats, open } = phaseTwoGate(loaded.stats, sp);
  if (!open) notFound();
  if (isVotePhase(stats.phase)) {
    // The ranking and reasons are public before voting too (owner call
    // 2026-09-28: reason posts link here and ask readers to like a reason).
    // The vote-first gate in VoteGate stays available but is switched off.
    const lockable = false;
    const board = await loadVoteBoard();
    const corpus = lockable ? [] : await loadReasonCorpus(null);
    return (
      <HomeVote
        stats={publicStats(stats)}
        board={
          lockable
            ? {
                ...EMPTY_VOTE_BOARD,
                total_votes: board.total_votes,
                total_reasons: board.total_reasons,
              }
            : board
        }
        cloud={wordCloud(corpus).slice(0, 16)}
        lockable={lockable}
        voteHref={voteHrefFrom(sp)}
      />
    );
  }
  // Results: the later story, loaded only here.
  const { default: SiteClient } = await import("@/components/SiteClient");
  const { storySlots } = await import("@/components/story");
  return (
    <SiteClient
      stats={stats}
      posts={loaded.posts}
      finalists={loaded.finalists}
      slots={reveal(stats.phase).story ? storySlots(stats) : undefined}
    />
  );
}
