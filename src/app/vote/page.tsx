import type { Metadata } from "next";
import { redirect } from "next/navigation";
import VoteClient from "@/components/VoteClient";
import { STORY_CHROME } from "@/components/story";
import { isVotePhase, phaseTwoGate, publicStats, reveal } from "@/lib/phase";
import { loadSiteData } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { stats } = await loadSiteData();
  if (isVotePhase(stats.phase)) {
    return {
      title: "開始投票｜台灣新創赴日形象資產決策標竿計畫 Phase Two",
      description: "每個 email 每天最多投給 3 家企業，每投給 1 家企業都必須寫下具體理由。",
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const loaded = await loadSiteData();
  const { finalists } = loaded;
  // Phase Two gate (owner, 2026-09-27): not public before vote_open.
  const { stats, open } = phaseTwoGate(loaded.stats, sp);
  if (!open) redirect("/");
  if (isVotePhase(stats.phase)) {
    // Daily ballot (spec v7b §2). Results keep the legacy page below.
    const pick = sp.pick;
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
