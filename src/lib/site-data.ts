import { getServerClient } from "@/lib/supabase-server";
import type { PublicFinalist, PublicPost, Stats } from "@/lib/types";

export const FALLBACK_STATS: Stats = {
  people: 0,
  companies: 0,
  phase: "pre",
  phase_mode: "auto",
  manual_phase: "nominate",
  nominate_open: null,
  nominate_close: null,
  vote_open: null,
  vote_close: null,
  results_label: "10 月 14–15 日",
  iqlite_url: "",
  ximu_url: "",
  partners_text: "Partner announcement coming soon",
  contact_email: "",
};

const FINALIST_COLUMNS =
  "id, company, name_en, one_liner, industry, jp_info, url, report_url, blurb, top_reason, sort, votes";

/** Everything the three public pages render from. One place, one shape. */
export async function loadSiteData(): Promise<{
  stats: Stats;
  posts: PublicPost[];
  finalists: PublicFinalist[];
}> {
  const supabase = await getServerClient();

  const [statsRes, postsRes, finalistsRes] = await Promise.all([
    supabase.rpc("stats"),
    supabase
      .from("posts_public")
      .select("id, company, company_en, url, reason, masked_email, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("finalists_public")
      .select(FINALIST_COLUMNS)
      .order("sort", { ascending: true }),
  ]);

  const stats = { ...FALLBACK_STATS, ...((statsRes.data as Stats | null) ?? {}) };
  const posts = (postsRes.data as PublicPost[] | null) ?? [];
  const rawFinalists =
    (finalistsRes.data as (PublicFinalist & { votes: number | null })[] | null) ??
    [];

  // Vote counts only leave the server once the results are public.
  const finalists: PublicFinalist[] = rawFinalists.map(({ votes, ...rest }) =>
    stats.phase === "results" && votes !== null ? { ...rest, votes } : rest,
  );

  return { stats, posts, finalists };
}
