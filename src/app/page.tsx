import HomePhase1 from "@/components/HomePhase1";
import { isPhaseOne, isVotePhase, phaseOneStats, publicStats, reveal } from "@/lib/phase";
import { loadReasonCorpus, loadSiteData, loadVoteBoard } from "@/lib/site-data";
import { wordCloud } from "@/lib/wordcloud";

// Board refreshes every 5 minutes; the rank snapshot behind it is hourly.
// The vote-phase word cloud is cached with the page (spec v7b §1.6).
export const revalidate = 300;

export default async function Page() {
  const { stats, posts, finalists } = await loadSiteData();
  if (isPhaseOne(stats.phase)) {
    return <HomePhase1 stats={phaseOneStats(stats)} />;
  }
  if (isVotePhase(stats.phase)) {
    // Community Intelligence Page (spec v7b §1, §4).
    const { default: HomeVote } = await import("@/components/HomeVote");
    const [board, corpus] = await Promise.all([
      loadVoteBoard(),
      loadReasonCorpus(null),
    ]);
    return (
      <HomeVote stats={publicStats(stats)} board={board} cloud={wordCloud(corpus)} />
    );
  }
  // Loaded only for results, so the later-phase copy is not part of the
  // Phase 1 or vote bundles.
  const { default: SiteClient } = await import("@/components/SiteClient");
  const { storySlots } = await import("@/components/story");
  return (
    <SiteClient
      stats={stats}
      posts={posts}
      finalists={finalists}
      slots={reveal(stats.phase).story ? storySlots(stats) : undefined}
    />
  );
}
