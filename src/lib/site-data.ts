import { createClient } from "@supabase/supabase-js";
import { withPreview } from "@/lib/phase";
import {
  EMPTY_BOARD,
  EMPTY_VOTE_BOARD,
  type Board,
  type CompanyDetail,
  type VoteBoard,
  type PublicFinalist,
  type PublicPost,
  type Stats,
} from "@/lib/types";

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
  results_label: "",
  iqlite_url: "",
  ximu_url: "",
  partners_text: "",
  contact_email: "",
};

const FINALIST_COLUMNS =
  "id, company, name_en, one_liner, industry, jp_info, url, report_url, blurb, top_reason, sort, votes";

/**
 * Cookie-less anon client: every public read is the same for every visitor,
 * so the pages can be served from the ISR cache (`revalidate = 300`).
 */
function publicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Everything the public pages render from. One place, one shape. */
export async function loadSiteData(): Promise<{
  stats: Stats;
  posts: PublicPost[];
  finalists: PublicFinalist[];
  board: Board;
}> {
  const supabase = publicClient();

  const [statsRes, postsRes, finalistsRes, boardRes] = await Promise.all([
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
    supabase.rpc("board"),
  ]);

  const stats = withPreview({
    ...FALLBACK_STATS,
    ...((statsRes.data as Stats | null) ?? {}),
  });
  const posts = (postsRes.data as PublicPost[] | null) ?? [];
  const rawFinalists =
    (finalistsRes.data as (PublicFinalist & { votes: number | null })[] | null) ??
    [];
  const board = { ...EMPTY_BOARD, ...((boardRes.data as Board | null) ?? {}) };

  // Vote counts only leave the server once the results are public.
  const finalists: PublicFinalist[] = rawFinalists.map(({ votes, ...rest }) =>
    stats.phase === "results" && votes !== null ? { ...rest, votes } : rest,
  );

  return { stats, posts, finalists, board };
}

/** Just the phase and dates (for /nominate). */
export async function loadStats(): Promise<Stats> {
  const { data } = await publicClient().rpc("stats");
  return withPreview({ ...FALLBACK_STATS, ...((data as Stats | null) ?? {}) });
}

/* ------------------------------------------------------ v7b: vote phase */

/** `vote_board()`: totals, leaderboard, hot / latest reasons. */
export async function loadVoteBoard(): Promise<VoteBoard> {
  const { data } = await publicClient().rpc("vote_board");
  return { ...EMPTY_VOTE_BOARD, ...((data as VoteBoard | null) ?? {}) };
}

/** `company_detail(domain)`, or null when it is not a visible candidate. */
export async function loadCompanyDetail(
  domain: string,
): Promise<CompanyDetail | null> {
  const { data, error } = await publicClient().rpc("company_detail", {
    p_domain: domain,
  });
  if (error) throw new Error(error.message);
  return (data as CompanyDetail | null) ?? null;
}

/** `reason_corpus(domain)`: visible reason texts (all when domain is null). */
export async function loadReasonCorpus(domain: string | null): Promise<string[]> {
  const { data } = await publicClient().rpc("reason_corpus", {
    p_domain: domain,
  });
  return (data as string[] | null) ?? [];
}
