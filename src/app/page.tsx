import SiteClient from "@/components/SiteClient";
import { getServerClient } from "@/lib/supabase-server";
import type { PublicFinalist, PublicPost, Stats } from "@/lib/types";

export const dynamic = "force-dynamic";

const FALLBACK_STATS: Stats = {
  people: 0,
  companies: 0,
  phase: "nominate",
  nominate_close: null,
  vote_close: null,
};

export default async function Page() {
  const supabase = await getServerClient();

  const [statsRes, postsRes, finalistsRes] = await Promise.all([
    supabase.rpc("stats"),
    supabase
      .from("posts_public")
      .select("id, company, reason, masked_email, score, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("finalists_public")
      .select("id, company, blurb, top_reason, sort, votes")
      .order("sort", { ascending: true }),
  ]);

  const stats = (statsRes.data as Stats | null) ?? FALLBACK_STATS;
  const posts = (postsRes.data as PublicPost[] | null) ?? [];
  const rawFinalists =
    (finalistsRes.data as (PublicFinalist & { votes: number | null })[] | null) ?? [];

  // Vote counts only leave the server once the results are public.
  const finalists: PublicFinalist[] = rawFinalists.map((f) =>
    stats.phase === "results" && f.votes !== null
      ? { ...f, votes: f.votes }
      : {
          id: f.id,
          company: f.company,
          blurb: f.blurb,
          top_reason: f.top_reason,
          sort: f.sort,
        },
  );

  return <SiteClient stats={stats} posts={posts} finalists={finalists} />;
}
