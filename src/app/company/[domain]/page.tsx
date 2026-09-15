import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import CompanyPage from "@/components/CompanyPage";
import { normalizeDomain } from "@/lib/format";
import { isPhaseOne, publicStats } from "@/lib/phase";
import {
  loadCompanyDetail,
  loadReasonCorpus,
  loadStats,
} from "@/lib/site-data";
import { wordCloud } from "@/lib/wordcloud";

export const revalidate = 300;

type Params = Promise<{ domain: string }>;

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
  const detail = await loadCompanyDetail(domainOf(domain)).catch(() => null);
  if (!detail) return { robots: { index: false } };
  return {
    title: `${detail.display_name}｜台灣新創前進日本｜Taiwan → Japan 2026`,
    description: `${detail.display_name} 的社群投票理由與關鍵字。`,
  };
}

/** `/company/[domain]` (spec v7b §3): vote, closed and results only. */
export default async function Page({ params }: { params: Params }) {
  const { domain } = await params;
  const stats = await loadStats();
  if (isPhaseOne(stats.phase)) redirect("/");
  const d = domainOf(domain);
  const detail = await loadCompanyDetail(d);
  if (!detail) notFound();
  const corpus = await loadReasonCorpus(detail.domain);
  return (
    <CompanyPage
      stats={publicStats(stats)}
      detail={detail}
      cloud={wordCloud(corpus)}
    />
  );
}
