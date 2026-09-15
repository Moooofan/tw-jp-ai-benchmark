import type { Metadata } from "next";
import VoteClient from "@/components/VoteClient";
import { STORY_CHROME } from "@/components/story";
import { isVotePhase, publicStats, reveal } from "@/lib/phase";
import { loadSiteData } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { stats } = await loadSiteData();
  if (isVotePhase(stats.phase)) {
    return {
      title: "投下今天的一票｜Taiwan → Japan 2026",
      description: "最多選三家，每家寫一句為什麼。",
    };
  }
  return {
    title: "Taiwan → Japan 2026",
    description: "輸入公司名稱就能提名。一起整理台灣新創前進日本的案例。",
  };
}

export default async function VotePage({
  searchParams,
}: {
  searchParams: Promise<{ pick?: string | string[] }>;
}) {
  const { stats, finalists } = await loadSiteData();
  if (isVotePhase(stats.phase)) {
    // Daily ballot (spec v7b §2). Pre / nominate keep the unchanged legacy
    // page below so the live Phase 1 output does not move.
    const { pick } = await searchParams;
    const { default: BallotClient } = await import("@/components/BallotClient");
    return (
      <BallotClient
        stats={publicStats(stats)}
        pick={typeof pick === "string" ? pick : ""}
      />
    );
  }
  return (
    <VoteClient
      stats={stats}
      finalists={finalists}
      chrome={reveal(stats.phase).story ? STORY_CHROME : undefined}
    />
  );
}
