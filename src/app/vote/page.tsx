import type { Metadata } from "next";
import VoteClient from "@/components/VoteClient";
import { loadSiteData } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "投票｜Taiwan → Japan AI Representation Benchmark 2026",
  description: "從 Community Shortlist 選出最多三家公司。每個 Email 最多投三家。",
};

export default async function VotePage() {
  const { stats, finalists } = await loadSiteData();
  return <VoteClient stats={stats} finalists={finalists} />;
}
