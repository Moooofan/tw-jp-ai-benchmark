import HomePhase1 from "@/components/HomePhase1";
import {
  nominationStats,
  PHASE_TWO_PATH,
  phaseTwoOpen,
  previewFromQuery,
} from "@/lib/phase";
import { loadSiteData } from "@/lib/site-data";

// Board refreshes every 5 minutes; the rank snapshot behind it is hourly.
export const revalidate = 30;

/**
 * `/` is the Phase One page in every phase (owner, 2026-09-27: 「Phase 1 跟
 * Phase 2 用不同的網址」). It never renders Phase Two or a "voting closed" page:
 * after `nominate_close` it shows nominations as ended, and once Phase Two is
 * public it links to `/phase-two`. Metadata stays the layout's Phase 1 set.
 */
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : undefined;
  const loaded = await loadSiteData();
  const preview = previewFromQuery(sp);
  const stats = preview ? { ...loaded.stats, phase: preview } : loaded.stats;
  const p2 =
    (preview && preview !== "pre" && preview !== "nominate") ||
    phaseTwoOpen(stats)
      ? PHASE_TWO_PATH
      : undefined;
  return (
    <HomePhase1
      stats={nominationStats(stats)}
      board={loaded.board}
      phaseTwoHref={p2}
    />
  );
}
