import type { Metadata } from "next";
import { redirect } from "next/navigation";
import CandidatesClient from "@/components/CandidatesClient";
import { phaseTwoGate, publicStats } from "@/lib/phase";
import { loadPendingCandidates, loadStats } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "沒有看到你心中的遺珠｜Taiwan → Japan 2026",
  description:
    "提出新的企業案例。取得 11 個不同 email 的支持後，它會正式進入投票池，並以 1 票起算。",
};

/** `/candidates` (spec v8 §6): 待確認遺珠 + 提名一個遺珠. Phase 2 only. */
export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const loaded = await loadStats();
  const { stats, open } = phaseTwoGate(loaded, sp);
  if (!open) redirect("/");
  const initial = await loadPendingCandidates();
  return <CandidatesClient stats={publicStats(stats)} initial={initial} />;
}
