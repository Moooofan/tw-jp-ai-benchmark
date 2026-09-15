import type { Metadata } from "next";
import NominateClient from "@/components/NominateClient";
import { STORY_CHROME } from "@/components/story";
import { phaseOneStats, reveal } from "@/lib/phase";
import { loadStats } from "@/lib/site-data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "提名台灣新創｜Taiwan → Japan 2026",
  description: "輸入公司名稱就能提名。一起整理台灣新創前進日本的案例。",
};

export default async function NominatePage() {
  const stats = await loadStats();
  return (
    <NominateClient
      stats={phaseOneStats(stats)}
      chrome={reveal(stats.phase).story ? STORY_CHROME : undefined}
    />
  );
}
