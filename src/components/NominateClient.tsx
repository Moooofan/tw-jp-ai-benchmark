"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Globe,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import { isNameKey, monthDay, nameKey } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { CompanyMatch, ExternalCompany, Stats } from "@/lib/types";
import Favicon from "./Favicon";
import Icon from "./Icon";
import { JUST_NOMINATED_KEY } from "./NominationBoard";
import ShareRow from "./ShareRow";
import SiteChrome, { type ChromeStory } from "./SiteChrome";

/**
 * 250 ms spent 4–6 requests of the /api/company-lookup per-IP budget on a
 * single company name; 400 ms roughly halves that without the box feeling
 * slow. See the rate-limit note in src/app/api/company-lookup/route.ts.
 */
const SEARCH_MS = 400;

/**
 * A per-browser id (v6f). Sent with every nomination so /admin can spot one
 * browser nominating many companies; ranking itself counts raw nominations
 * (owner's rule, v6g).
*/
const CID_KEY = "benchmark:cid";

function clientId(): string | null {
  try {
    const got = window.localStorage.getItem(CID_KEY);
    if (got) return got;
    const made =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `r-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(CID_KEY, made);
    return made;
  } catch {
    return null; // private mode / storage blocked: the nomination still counts
  }
}

/** Same normalisation as the name key: collapse whitespace, trim. */
const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();
const NAME_MIN = 2;
/** Wikidata descriptions are one-liners; anything longer is noise in a row. */
const DESC_MAX = 30;
const clip = (s: string) =>
  s.length > DESC_MAX ? `${s.slice(0, DESC_MAX)}…` : s;

/**
 * `typed`: the company was not in the list and is nominated by its typed name
 * (v6n) — the website is optional and the database keys it as `name:…`.
 * `external`: picked from the public-data suggestions (v6l) — it already has
 * a real domain, shown in an editable website field.
 */
type Step =
  | { kind: "search" }
  | {
      kind: "confirm";
      company: CompanyMatch;
      typed: boolean;
      external?: boolean;
    }
  | { kind: "done"; company: CompanyMatch };

function CompanyCard({ c }: { c: CompanyMatch }) {
  const pending = isNameKey(c.domain);
  return (
    <div className="cocard">
      <Favicon domain={c.domain} name={c.display_name} size={44} />
      <div>
        <b>{c.display_name}</b>
        {c.aliases.length > 0 ? <small>{c.aliases.join(" · ")}</small> : null}
        {pending ? (
          <small>官網待確認</small>
        ) : (
          <a
            href={`https://${c.domain}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {c.domain}
            <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * `/nominate` (spec v6 §4, back to campaign memo v4.0 in v6f): type a company
 * name -> pick a match (ours, a public-data suggestion, or the typed name
 * itself, website optional, v6n) -> confirm -> done. No reason, no email, no
 * registration; the v6r reason and the v6e email requirements are both gone.
 * The saved-email localStorage key is left alone — Phase 2 still uses it.
 */
export default function NominateClient({
  stats,
  chrome,
}: {
  stats: Stats;
  chrome?: ChromeStory;
}) {
  const supabase = getBrowserClient();
  const [step, setStep] = useState<Step>({ kind: "search" });
  const [name, setName] = useState("");
  const [site, setSite] = useState("");
  const [matches, setMatches] = useState<CompanyMatch[]>([]);
  const [externals, setExternals] = useState<ExternalCompany[]>([]);
  const [searched, setSearched] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = name.trim();
    if (!q) {
      setMatches([]);
      setExternals([]);
      setSearched("");
      return;
    }
    let live = true;
    const abort = new AbortController();
    const t = setTimeout(() => {
      // Our own resolver decides the list (instant, authoritative); the public
      // lookup only appends extra candidates and must never hold it up.
      void (async () => {
        const { data } = await supabase.rpc("resolve_company", { q });
        if (!live) return;
        setMatches((data as CompanyMatch[] | null) ?? []);
        setSearched(q);
      })();
      void (async () => {
        try {
          const res = await fetch(
            `/api/company-lookup?q=${encodeURIComponent(q)}`,
            { signal: abort.signal },
          );
          const json = (await res.json()) as {
            suggestions?: ExternalCompany[];
          };
          if (!live) return;
          setExternals(json.suggestions ?? []);
        } catch {
          if (live) setExternals([]); // suggestions are a bonus, never an error
        }
      })();
    }, SEARCH_MS);
    return () => {
      live = false;
      abort.abort();
      clearTimeout(t);
    };
  }, [name, supabase]);

  // Offer "nominate the typed name" once results for exactly this text are
  // back and none of them is an exact display name / alias match.
  const typed = cleanName(name);
  const typedLower = typed.toLowerCase();
  const offerTyped =
    typed.length >= NAME_MIN &&
    searched === name.trim() &&
    !matches.some(
      (m) =>
        cleanName(m.display_name).toLowerCase() === typedLower ||
        m.aliases.some((a) => cleanName(a).toLowerCase() === typedLower),
    );

  // Public-data suggestions we do not already list ourselves (v6l).
  const extras = externals.filter(
    (e) =>
      !matches.some(
        (m) =>
          m.domain === e.domain ||
          cleanName(m.display_name).toLowerCase() ===
            cleanName(e.display_name).toLowerCase(),
      ),
  );

  function pickExternal(e: ExternalCompany) {
    setSite(e.domain);
    setStep({
      kind: "confirm",
      company: { domain: e.domain, display_name: e.display_name, aliases: [] },
      typed: false,
      external: true,
    });
  }

  async function nominate(c: CompanyMatch, typedStep: boolean) {
    setErr("");
    setBusy(true);
    // A `name:` company (typed now, or picked from the list) is sent with no
    // domain: the database derives the key from the name (a website typed on
    // the confirm step is sent instead). For a listed one, send a name that
    // maps back to the same key.
    let pDomain: string | null = c.domain;
    let pName = name.trim() || c.display_name;
    if (step.kind === "confirm" && step.external) {
      // Keep the suggestion's own name and its (possibly edited) website —
      // the typed text is usually a partial, lower-case version of it.
      pDomain = site.trim() || c.domain;
      pName = c.display_name;
    } else if (isNameKey(c.domain)) {
      pDomain = typedStep ? site.trim() || null : null;
      pName =
        nameKey(c.display_name) === c.domain
          ? c.display_name
          : c.domain.slice("name:".length);
    }
    const { data, error } = await supabase.rpc("nominate_company", {
      p_domain: pDomain,
      p_display_name: pName,
      p_reason: null,
      p_email: null,
      p_client_id: clientId(),
    });
    setBusy(false);
    if (error) {
      setErr(errText(error));
      return;
    }
    try {
      window.sessionStorage.setItem(JUST_NOMINATED_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    setStep({
      kind: "done",
      company: (data as CompanyMatch | null) ?? c,
    });
  }

  function restart() {
    setStep({ kind: "search" });
    setName("");
    setSite("");
    setMatches([]);
    setExternals([]);
    setSearched("");
    setErr("");
    setTimeout(() => nameInput.current?.focus(), 0);
  }

  let body: React.ReactNode;
  if (stats.phase !== "nominate") {
    body =
      stats.phase === "pre" ? (
        <>
          <h3>提名尚未開放</h3>
          <p>提名將於 {monthDay(stats.nominate_open)} 開放。</p>
          <Link className="btn btn--ghost" href="/">
            回到首頁
          </Link>
        </>
      ) : (
        <>
          <h3>提名已結束</h3>
          <p>提名期間已結束。</p>
          <Link className="btn btn--ghost" href="/">
            回到首頁
          </Link>
        </>
      );
  } else if (step.kind === "done") {
    const c = step.company;
    body = (
      <div className="flow flow--done">
        <span className="okmark" aria-hidden="true">
          ✓
        </span>
        <h3>提名完成！</h3>
        <CompanyCard c={c} />
        <p>這家公司已被提名，謝謝你。</p>
        <div className="after">
          <button type="button" className="btn btn--red" onClick={restart}>
            再提名一家
            <Icon icon={ArrowRight} />
          </button>
          <Link className="btn btn--ghost" href="/">
            回到首頁
          </Link>
        </div>
        <ShareRow
          text={`我提名了 ${c.display_name}：過去五年，你認為哪些台灣新創最值得作為日本市場發展案例？`}
        />
      </div>
    );
  } else if (step.kind === "confirm") {
    const c = step.company;
    body = (
      <div className="flow">
        <h3>{step.typed ? "提名這家公司" : "是這家公司嗎？"}</h3>
        <CompanyCard c={c} />
        {step.typed || step.external ? (
          <>
            <p className="fine">
              {step.external
                ? "網址來自公開資料，可以修改。"
                : "我們會再確認這家公司的官方網站。"}
            </p>
            <div className="f">
              <label htmlFor="site">
                <Icon icon={Globe} />
                {step.external ? "官方網站" : "官方網站（選填）"}
              </label>
              <input
                id="site"
                value={site}
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://"
                aria-describedby="site-hint"
                onChange={(e) => {
                  setSite(e.target.value);
                  setErr("");
                }}
              />
              <p id="site-hint" className="fine">
                {step.external
                  ? "這會是這家公司在榜上的身分。"
                  : "知道的話填一下，能幫我們更快辨識。"}
              </p>
            </div>
          </>
        ) : null}
        {err ? <p className="err">{err}</p> : null}
        <div className="after">
          <button
            type="button"
            className="btn btn--red"
            disabled={busy}
            onClick={() => void nominate(c, step.typed)}
          >
            {busy ? "提名中…" : "送出提名"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => {
              setStep({ kind: "search" });
              setSite("");
              setErr("");
            }}
          >
            <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
            不是，重新搜尋
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flow">
        <div className="f">
          <label htmlFor="co">
            <Icon icon={Search} />
            公司名稱
          </label>
          <input
            id="co"
            ref={nameInput}
            value={name}
            maxLength={60}
            autoComplete="off"
            autoFocus
            placeholder="例如：品牌名、中文名或英文名"
            onChange={(e) => {
              setName(e.target.value);
              setErr("");
            }}
          />
        </div>

        {matches.length > 0 || extras.length > 0 || offerTyped ? (
          <ul className="matches" aria-label="搜尋結果">
            {matches.map((m) => (
              <li key={m.domain}>
                <button
                  type="button"
                  onClick={() =>
                    setStep({ kind: "confirm", company: m, typed: false })
                  }
                >
                  <Favicon domain={m.domain} name={m.display_name} />
                  <span className="co">
                    <b>{m.display_name}</b>
                    {m.aliases.length > 0 ? (
                      <small>{m.aliases.join(" · ")}</small>
                    ) : null}
                  </span>
                  <span className="dom">
                    {isNameKey(m.domain) ? "官網待確認" : m.domain}
                  </span>
                </button>
              </li>
            ))}
            {extras.length > 0 ? (
              <li className="sep" aria-hidden="true">
                其他可能的公司
              </li>
            ) : null}
            {extras.map((e) => (
              <li key={`x:${e.domain}`}>
                <button type="button" onClick={() => pickExternal(e)}>
                  <span
                    className="fav fav--none"
                    style={{ width: 28, height: 28 }}
                    aria-hidden="true"
                  >
                    {(e.display_name.trim()[0] ?? "?").toUpperCase()}
                  </span>
                  <span className="co">
                    <b>{e.display_name}</b>
                    {e.description ? <small>{clip(e.description)}</small> : null}
                  </span>
                  <span className="dom">
                    <span className="srcchip">
                      {e.source === "web" ? "網站驗證" : "公開資料"}
                    </span>
                    {e.domain}
                  </span>
                </button>
              </li>
            ))}
            {offerTyped ? (
              <li>
                <button
                  type="button"
                  onClick={() =>
                    setStep({
                      kind: "confirm",
                      company: {
                        domain: nameKey(typed) ?? "name:",
                        display_name: typed,
                        aliases: [],
                      },
                      typed: true,
                    })
                  }
                >
                  <span
                    className="fav fav--none"
                    style={{ width: 28, height: 28 }}
                    aria-hidden="true"
                  >
                    <Plus size={16} strokeWidth={2} />
                  </span>
                  <span className="co">
                    <b>找不到？直接提名「{typed}」</b>
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}

        {err ? <p className="err">{err}</p> : null}
      </div>
    );
  }

  return (
    <SiteChrome stats={stats} story={chrome}>
      <div className="pagehero">
        <div className="wrap">
          <span className="chip">Nominate</span>
          <h1>提名台灣新創</h1>
          <p>輸入公司名稱，確認後就完成。</p>
        </div>
      </div>
      <div className="wrap">
        <div className="solo">
          <div className="formcard">{body}</div>
          <ul className="steps-note">
            <li>中文、英文、品牌名都可以，找不到就選「直接提名」。</li>
            <li>官方網站是選填，知道的話填一下，能幫我們更快辨識。</li>
            <li>提名不是投票。提名次數只決定哪 10 家進入第二階段，正式票數第二階段才開始計算。</li>
          </ul>
        </div>
      </div>
    </SiteChrome>
  );
}
