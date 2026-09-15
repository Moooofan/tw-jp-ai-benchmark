import type { Metadata } from "next";
import VoteClient from "@/components/VoteClient";
import { STORY_CHROME } from "@/components/story";
import { reveal } from "@/lib/phase";
import { loadSiteData } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Taiwan → Japan 2026",
  description: "輸入公司名稱就能提名。一起整理台灣新創前進日本的案例。",
};

export default async function VotePage() {
  const { stats, finalists } = await loadSiteData();
  return (
    <VoteClient
      stats={stats}
      finalists={finalists}
      chrome={reveal(stats.phase).story ? STORY_CHROME : undefined}
    />
  );
}
