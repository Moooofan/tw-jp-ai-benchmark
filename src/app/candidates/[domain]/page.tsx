import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import CandidateShare from "@/components/CandidateShare";
import { normalizeDomain } from "@/lib/format";
import { isPhaseOne, previewFromQuery, publicStats } from "@/lib/phase";
import { loadCandidateDetail, loadStats } from "@/lib/site-data";

export const dynamic = "force-dynamic";

type Params = Promise<{ domain: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function domainOf(raw: string): string {
  let d = raw;
  try {
    d = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  return normalizeDomain(d);
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { domain } = await params;
  const stats = await loadStats();
  if (isPhaseOne(stats.phase)) return {};
  const detail = await loadCandidateDetail(domainOf(domain)).catch(() => null);
  if (!detail) return { robots: { index: false } };
  return {
    title: `${detail.display_name}｜待確認遺珠｜Taiwan → Japan 2026`,
    description: `支持 ${detail.display_name} 進入 Taiwan → Japan 2026 的正式投票池。`,
  };
}

/** `/candidates/[domain]` (spec v8 §6): one candidate's share page. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { domain } = await params;
  const sp = await searchParams;
  const loaded = await loadStats();
  const preview = previewFromQuery(sp);
  const stats = preview ? { ...loaded, phase: preview } : loaded;
  if (isPhaseOne(stats.phase)) redirect("/");
  const detail = await loadCandidateDetail(domainOf(domain));
  if (!detail) notFound();
  return <CandidateShare stats={publicStats(stats)} candidate={detail} />;
}
