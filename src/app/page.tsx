import HomePhase1 from "@/components/HomePhase1";
import { isPhaseOne, phaseOneStats, reveal } from "@/lib/phase";
import { loadSiteData } from "@/lib/site-data";

// Board refreshes every 5 minutes; the rank snapshot behind it is hourly.
export const revalidate = 300;

export default async function Page() {
  const { stats, posts, finalists, board } = await loadSiteData();
  if (isPhaseOne(stats.phase)) {
    return <HomePhase1 stats={phaseOneStats(stats)} board={board} />;
  }
  // Loaded only for vote / closed / results, so the later-phase copy is not
  // part of the Phase 1 bundle.
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
