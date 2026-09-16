import { NextResponse } from "next/server";
import { normalizeDomain } from "@/lib/format";
import type { ExternalCompany } from "@/lib/types";

/**
 * External company lookup (v6l).
 *
 * WHY: `resolve_company()` only knows the companies already in our own
 * database, so a smaller Taiwanese startup ("FunNow", "Pinkoi", "iCHEF")
 * looks like it does not exist. This route suggests real companies with
 * their official websites so the nominator can pick one and keep our
 * domain-as-identity model, instead of falling back to a `name:` key.
 *
 * DATA SOURCE / LICENCE: Wikidata (www.wikidata.org), whose structured data
 * is released under CC0 1.0 (public domain) — no attribution is required and
 * we may reuse it freely. We only read two public, key-free endpoints:
 *   wbsearchentities  – label/alias search
 *   wbgetentities     – claims, labels, descriptions for the matched ids
 * Nothing but the display name and the normalised domain is ever stored;
 * the QID and the Wikidata description are shown and then thrown away.
 *
 * GUARD RAILS: nodejs runtime, never cached, no Supabase client is created
 * here (so no service key can leak), 4 s upstream timeout, a soft in-memory
 * rate limit, and every failure degrades to `{suggestions: []}`.
 */

export const runtime = "nodejs";
export const revalidate = 0;
export const dynamic = "force-dynamic";

const WD_API = "https://www.wikidata.org/w/api.php";
/** Wikimedia asks every API client to identify itself. */
const UA =
  "tw-jp-ai-benchmark/1.0 (https://tw-jp-ai-benchmark.vercel.app) company-lookup";

const MIN_Q = 2;
const MAX_Q = 60;
const MAX_SUGGESTIONS = 6;
const SEARCH_LIMIT = 8;
const UPSTREAM_MS = 4_000;
const CACHE_MS = 10 * 60_000;
const RATE_MAX = 30; // requests …
const RATE_WINDOW_MS = 60_000; // … per minute, per IP

/**
 * P31 (instance of) values that mark a company, derived by reading what
 * Wikidata actually returns for Taiwanese startups (Pinkoi → Q4830453,
 * iCHEF/Appier → Q783794, 誠品 → Q891723, 鼎泰豐 → Q18534542 …).
 */
const COMPANY_TYPES = new Set([
  "Q4830453", // business
  "Q6881511", // enterprise
  "Q783794", // company
  "Q891723", // public company
  "Q1589009", // privately held company
  "Q167037", // corporation
  "Q3454868", // startup
  "Q1058914", // software company
  "Q18388277", // technology company
  "Q43229", // organization
  "Q507619", // retail chain
  "Q213441", // shop
  "Q18534542", // restaurant chain
  "Q217107", // travel agency
  "Q1341478", // energy company
  "Q62058278", // network operator
  "Q2085381", // publisher
  "Q1002697", // periodical
]);

/**
 * Properties that a place, a person or a written work carries and a company
 * never does. An entity is not offered as a company when it has one, which
 * is what keeps "awoo" from suggesting 吉里巴斯 (kiribati.gov.ki, P1082
 * population) or an Italian comune — both of which do have a P856 website.
 */
const NOT_A_COMPANY_PROPS = [
  "P1082", // population
  "P36", // capital
  "P30", // continent
  "P47", // shares border with
  "P131", // located in administrative territorial entity
  "P21", // sex or gender
  "P569", // date of birth
  "P50", // author
  "P1476", // title (of a work)
];

const TAIWAN = "Q865";

type Claim = {
  mainsnak?: { datavalue?: { value?: unknown } };
};
/** `rank` only orders the list; it never reaches the client. */
type Ranked = ExternalCompany & { rank: number };
type Entity = {
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  claims?: Record<string, Claim[]>;
};

const cache = new Map<string, { at: number; data: ExternalCompany[] }>();
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const seen = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  seen.push(now);
  hits.set(ip, seen);
  if (hits.size > 5_000) hits.clear(); // crude ceiling, single process
  return seen.length > RATE_MAX;
}

async function wikidata(
  params: Record<string, string>,
): Promise<Record<string, unknown> | null> {
  const url = `${WD_API}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null; // timeout, upstream rate limit, bad JSON — all the same here
  }
}

const qid = (c: Claim): string | null => {
  const v = c.mainsnak?.datavalue?.value;
  return v && typeof v === "object" && "id" in v
    ? String((v as { id: string }).id)
    : null;
};

const pick = (
  bag: Record<string, { value?: string }> | undefined,
): string | undefined =>
  bag?.["zh-tw"]?.value ?? bag?.["zh"]?.value ?? bag?.["en"]?.value;

/**
 * P856 (official website) → the shortest registrable-looking domain, using
 * the same rules as `normalizeDomain()` / `public.normalize_domain` so the
 * suggestion keys to exactly what `nominate_company()` would store. iCHEF
 * lists both shop.ichefpos.com and ichefpos.com; we want the latter.
 */
function bestDomain(claims: Claim[] | undefined): string | null {
  const domains = (claims ?? [])
    .map((c) => c.mainsnak?.datavalue?.value)
    .filter((v): v is string => typeof v === "string")
    .map((u) => normalizeDomain(u))
    .filter((d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/.test(d));
  if (domains.length === 0) return null;
  domains.sort(
    (a, b) => a.split(".").length - b.split(".").length || a.length - b.length,
  );
  return domains[0];
}

async function lookup(q: string): Promise<ExternalCompany[]> {
  const found = await wikidata({
    action: "wbsearchentities",
    search: q,
    language: "zh-tw",
    uselang: "zh-tw",
    type: "item",
    limit: String(SEARCH_LIMIT),
  });
  const ids = Array.isArray(found?.search)
    ? (found.search as { id?: string }[])
        .map((s) => s.id)
        .filter((id): id is string => typeof id === "string")
    : [];
  if (ids.length === 0) return [];

  const full = await wikidata({
    action: "wbgetentities",
    ids: ids.join("|"),
    props: "claims|labels|descriptions",
    languages: "zh-tw|zh|en",
  });
  const entities = (full?.entities ?? {}) as Record<string, Entity>;

  const out: Ranked[] = [];
  for (const id of ids) {
    // keep the order Wikidata judged most relevant
    const e = entities[id];
    if (!e) continue;
    const claims = e.claims ?? {};
    if (NOT_A_COMPANY_PROPS.some((p) => claims[p]?.length)) continue;

    const types = (claims.P31 ?? []).map(qid).filter(Boolean) as string[];
    const isCompanyType = types.some((t) => COMPANY_TYPES.has(t));
    // "looks like a company": a company-ish P31, or simply an entity that
    // publishes an official website.
    if (!isCompanyType && !claims.P856?.length) continue;
    const domain = bestDomain(claims.P856);
    if (!domain) continue; // no usable website → useless to us

    const display_name = pick(e.labels)?.trim();
    if (!display_name) continue;
    const taiwan =
      (claims.P17 ?? []).some((c) => qid(c) === TAIWAN) ||
      domain.endsWith(".tw");

    out.push({
      display_name,
      domain,
      description: pick(e.descriptions)?.trim() ?? "",
      source: "wikidata",
      taiwan,
      rank: isCompanyType ? 1 : 0,
    });
  }

  const seen = new Set<string>();
  return out
    .filter((c) => (seen.has(c.domain) ? false : seen.add(c.domain)))
    .sort((a, b) => Number(b.taiwan) - Number(a.taiwan) || b.rank - a.rank)
    .slice(0, MAX_SUGGESTIONS)
    .map((c) => ({
      display_name: c.display_name,
      domain: c.domain,
      description: c.description,
      source: c.source,
      taiwan: c.taiwan,
    }));
}

export async function GET(req: Request) {
  const empty = NextResponse.json(
    { suggestions: [] },
    { headers: { "cache-control": "no-store" } },
  );
  try {
    const q = (new URL(req.url).searchParams.get("q") ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_Q);
    if (q.length < MIN_Q) return empty;

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "local";
    if (rateLimited(ip)) return empty;

    const key = q.toLowerCase();
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < CACHE_MS) {
      return NextResponse.json(
        { suggestions: hit.data },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const data = await lookup(q);
    cache.set(key, { at: now, data });
    if (cache.size > 500) {
      for (const [k, v] of cache) if (now - v.at > CACHE_MS) cache.delete(k);
    }
    return NextResponse.json(
      { suggestions: data },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return empty; // the client must never see a 500 from a suggestion box
  }
}
