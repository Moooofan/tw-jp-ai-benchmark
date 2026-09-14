import type { Metadata } from "next";
import NominateClient from "@/components/NominateClient";
import { loadSiteData } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "提名｜Taiwan → Japan AI Representation Benchmark 2026",
  description: "提名你認為最值得觀察的台灣赴日新創。每人最多提名三家公司。",
};

export default async function NominatePage() {
  const { stats, posts } = await loadSiteData();
  return <NominateClient stats={stats} posts={posts} />;
}
