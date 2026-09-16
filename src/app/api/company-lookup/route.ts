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
 * v6m adds a SECOND source: when Wikidata gives us fewer than three hits and
 * the query is ASCII-ish, we guess a short list of likely official domains
 * from the name and *verify* each by fetching it — a domain is only offered
 * when the live page names the company in its <title> / og:site_name /
 * og:title. See the block above `GET` for the rules and the guard rails.
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
/**
 * A result we could not fill is kept for 30 s, not 10 minutes: a single slow
 * cold start used to blank a company for the rest of the lambda's life.
 */
const NEG_CACHE_MS = 30_000;
/**
 * Per-IP budget. This used to be 30/minute, which sounds generous and is not:
 * the suggestion box debounces at 250 ms, so typing one company name spends
 * 4–6 requests and /nominate and /vote share the bucket. Three or four
 * searches in a minute exhausted it and every later lookup answered
 * `{suggestions: []}` — indistinguishable, to the user, from "no such
 * company". Measured in production on 2026-09-16: requests 1–26 returned
 * results, 27–40 returned nothing, and it healed by itself 60 s later.
 */
const RATE_MAX = 120; // requests …
const RATE_WINDOW_MS = 60_000; // … per minute, per IP
/**
 * Whole-route wall clock. The Vercel function runs in iad1 (US-East) while
 * the sites it probes are in Taiwan, so a cold pass measured 3.4–4.5 s
 * against a 3 s budget and silently returned a short list. The budget is now
 * generous enough for that round trip and still safely under the 10 s
 * function limit, Wikidata's own two calls included.
 */
const TOTAL_MS = 8_000;

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

/* ------------------------------------------------------------------ *
 * Pass 2 — domain guessing, verified by actually fetching the site.
 *
 * WHY: Wikidata simply has no item for most small Taiwanese startups
 * (FunNow, 91APP, Omnichat, awoo all return nothing), which are exactly
 * the companies this campaign is about. Their official site, however, is
 * almost always a predictable domain built from the name. So we guess a
 * short list of domains, fetch each one, and only keep a domain when the
 * page it actually serves names the company in its <title> / og:site_name
 * / og:title. A guess we could not confirm is never shown.
 *
 * SAFETY: same guard rails as the Wikidata pass — no key, no storage, a
 * hard 3 s per-request timeout, at most 64 KB of any response is read,
 * bounded concurrency, and every failure degrades to "no suggestion".
 * ------------------------------------------------------------------ */

/** Letters/digits/spaces/hyphens only — a CJK query cannot name a domain. */
const ASCII_Q = /^[A-Za-z0-9][A-Za-z0-9 -]{0,28}[A-Za-z0-9]$/;
/** Below this many Wikidata hits we bother guessing domains. */
const WEB_MIN_WIKIDATA = 3;
const WEB_MAX_CANDIDATES = 8;
const WEB_CONCURRENCY = 4;
const WEB_TIMEOUT_MS = 3_000;
/**
 * The whole guessing pass, not just one socket, is bounded: a query like
 * "kkday" or "gogoro" has several candidates that simply hang, and two waves
 * of those would add 6 s to a suggestion box. Measured worst case is now
 * Wikidata (~0.8 s) + this budget.
 */
const WEB_PASS_MS = 4_500;
/** Below this much time left, a probe wave cannot finish; don't start one. */
const WEB_MIN_BUDGET_MS = 1_000;
const WEB_MAX_BYTES = 64 * 1024;
/** Sites hide behind a WAF for unknown agents; ask as an ordinary browser. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** `FunNow` → `funnow`; `Pink Oi` → `pinkoi` (+ the `pink-oi` variant). */
function slugsOf(q: string): { slug: string; hyphen: string | null } {
  const lower = q.toLowerCase().trim();
  return {
    slug: lower.replace(/[\s_]+/g, ""),
    hyphen: /[\s_]/.test(lower) ? lower.replace(/[\s_]+/g, "-") : null,
  };
}

/**
 * The guess list, in the documented order. When the query has a space we
 * interleave the hyphenated variant so it is still reached inside the
 * `WEB_MAX_CANDIDATES` budget instead of being crowded out.
 */
function candidates(slug: string, hyphen: string | null): string[] {
  // Measured on the real companies this campaign cares about: `get<slug>.com`
  // and `<slug>app.com` never produced a correct hit (getomnichat.com and
  // awooapp.com are unrelated products) and were the slowest candidates, while
  // `<slug>.ai` is the actual home of awoo and Omnichat. Trading those two away
  // keeps `.ai` inside the budget and the cold lookup under 4 s.
  const shape = (s: string) => [
    `${s}.com`,
    `${s}.com.tw`,
    `${s}.tw`,
    `${s}.io`,
    `${s}.co`,
    `my${s}.com`,
    `${s}.ai`,
  ];
  const a = shape(slug);
  const b = hyphen ? shape(hyphen) : [];
  const out: string[] = [];
  for (let i = 0; i < a.length; i++) {
    out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return [...new Set(out)]
    .filter((d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/.test(d))
    .slice(0, WEB_MAX_CANDIDATES);
}

/**
 * Per-request timeout AND the whole-pass deadline, whichever fires first.
 * `AbortSignal.any` needs Node >= 20.3; on anything older we would rather
 * fall back to the per-request timeout than have every probe throw.
 */
const bothSignals = (a: AbortSignal, b: AbortSignal): AbortSignal =>
  typeof AbortSignal.any === "function" ? AbortSignal.any([a, b]) : a;

/** Read at most `WEB_MAX_BYTES` of a response, then hang up. */
async function readHead(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return (await res.text()).slice(0, WEB_MAX_BYTES);
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let seen = 0;
  try {
    while (seen < WEB_MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  return text;
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");

function metaContent(html: string, property: string): string {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key =
      /\b(?:property|name)\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? "";
    if (key.toLowerCase() !== property) continue;
    const value = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
      tag,
    );
    const raw = value?.[1] ?? value?.[2] ?? value?.[3];
    if (raw) return decodeEntities(raw).trim();
  }
  return "";
}

const titleOf = (html: string): string =>
  decodeEntities(
    /<title\b[^>]*>([\s\S]*?)<\/title>/i
      .exec(html)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? "",
  ).trim();

const squash = (s: string): string => s.replace(/\s+/g, "").toLowerCase();

/**
 * "台北｜桃園 | FunNow - 隨訂即用" → "FunNow": the title minus everything after
 * the first separator, except that we prefer the segment that actually names
 * the company when the site leads with a city or a tagline.
 */
function cleanTitle(t: string, needle: string): string {
  const parts = t
    .split(/[|\-｜—]/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  return parts.find((x) => squash(x).includes(needle)) ?? parts[0];
}

/**
 * A domain can resolve, answer 200 with HTML and still carry the name we
 * searched for while belonging to nobody — "gogoro.tw – Domain For Sale" is a
 * real measured example. Parking pages and interstitials are rejected even
 * when the title check passes.
 */
const PARKED =
  /(domain|網域|域名).{0,20}(for sale|出售|出讓|販售)|buy this domain|this domain is for sale|domain parking|parked (free )?(at|by)|checking your browser|just a moment|attention required|access denied|are you a robot/i;

function parked(title: string, domain: string): boolean {
  if (PARKED.test(title)) return true;
  // A page whose entire name is its own address is a placeholder, not a site.
  return squash(title) === squash(domain) || squash(title) === `www.${domain}`;
}

/**
 * Fetch one candidate and decide whether it really is this company. A 200,
 * an HTML content-type and the slug appearing in the page's own name are all
 * required — that is what keeps parked pages, registrar placeholders and
 * unrelated squatters out of the list.
 */
async function probe(
  candidate: string,
  slug: string,
  typed: string,
  deadline: AbortSignal,
): Promise<ExternalCompany | null> {
  if (deadline.aborted) return null;
  try {
    const res = await fetch(`https://${candidate}/`, {
      redirect: "follow",
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.8",
      },
      signal: bothSignals(AbortSignal.timeout(WEB_TIMEOUT_MS), deadline),
      cache: "no-store",
    });
    if (res.status !== 200) return null;
    if (!/^text\/html|^application\/xhtml/i.test(res.headers.get("content-type") ?? ""))
      return null;

    const html = await readHead(res);
    const title = titleOf(html);
    const siteName = metaContent(html, "og:site_name");
    const ogTitle = metaContent(html, "og:title");
    const needle = squash(slug);
    if (!needle) return null;
    const named = [title, siteName, ogTitle].some((v) =>
      squash(v).includes(needle),
    );
    if (!named) return null;
    if (parked(title, candidate) || parked(ogTitle, candidate)) return null;

    // The redirect target is the real home, so funnow.com → myfunnow.com
    // is recorded as myfunnow.com.
    const domain = normalizeDomain(res.url || `https://${candidate}/`);
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9-]+)+$/.test(domain))
      return null;

    const display_name =
      siteName.trim() || cleanTitle(title, needle) || typed;
    return {
      display_name: display_name.slice(0, 80),
      domain,
      description: "",
      source: "web",
      taiwan: domain.endsWith(".tw"),
    };
  } catch {
    return null; // DNS failure, TLS error, timeout, non-UTF8 junk — all "no"
  }
}

/** Probe the candidate list with a bounded number of sockets in flight. */
async function probeAll(
  list: string[],
  slug: string,
  typed: string,
  budgetMs: number,
): Promise<ExternalCompany[]> {
  const found: (ExternalCompany | null)[] = new Array(list.length).fill(null);
  const deadline = AbortSignal.timeout(budgetMs);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= list.length || deadline.aborted) return;
      found[i] = await probe(list[i], slug, typed, deadline);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(WEB_CONCURRENCY, list.length) }, worker),
  );
  return found.filter((c): c is ExternalCompany => c !== null);
}

/** Wikidata first; guessed-and-verified domains only fill the gap. */
async function suggest(q: string): Promise<ExternalCompany[]> {
  const started = Date.now();
  const base = await lookup(q);
  if (base.length >= WEB_MIN_WIKIDATA || !ASCII_Q.test(q)) return base;

  try {
    const { slug, hyphen } = slugsOf(q);
    if (slug.length < 2) return base;
    // Wikidata has already spent part of the route's wall clock; the guessing
    // pass gets whatever is left of it, capped at WEB_PASS_MS.
    const budget = Math.min(WEB_PASS_MS, TOTAL_MS - (Date.now() - started));
    if (budget < WEB_MIN_BUDGET_MS) return base;
    const web = await probeAll(candidates(slug, hyphen), slug, q, budget);
    const seen = new Set(base.map((c) => c.domain));
    const extra = web.filter((c) =>
      seen.has(c.domain) ? false : seen.add(c.domain),
    );
    return [...base, ...extra].slice(0, MAX_SUGGESTIONS);
  } catch {
    return base; // this pass is a bonus and must never break the route
  }
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

    // The cache is answered BEFORE the rate limit: a warm answer costs no
    // upstream request, so charging quota for it only threw away work we had
    // already done and turned a fast repeat lookup into an empty one.
    const key = q.toLowerCase();
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.at < (hit.data.length ? CACHE_MS : NEG_CACHE_MS)) {
      return NextResponse.json(
        { suggestions: hit.data },
        { headers: { "cache-control": "no-store" } },
      );
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "local";
    if (rateLimited(ip)) return empty;

    const data = await suggest(q);
    cache.set(key, { at: now, data });
    if (cache.size > 500) {
      for (const [k, v] of cache)
        if (now - v.at > (v.data.length ? CACHE_MS : NEG_CACHE_MS))
          cache.delete(k);
    }
    return NextResponse.json(
      { suggestions: data },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return empty; // the client must never see a 500 from a suggestion box
  }
}
