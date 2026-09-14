import SiteClient from "@/components/SiteClient";
import { loadSiteData } from "@/lib/site-data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { stats, posts, finalists } = await loadSiteData();
  return <SiteClient stats={stats} posts={posts} finalists={finalists} />;
}
