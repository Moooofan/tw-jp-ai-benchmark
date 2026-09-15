"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Globe,
  RotateCcw,
  Search,
} from "lucide-react";
import { monthDay } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { CompanyMatch, Stats } from "@/lib/types";
import Favicon from "./Favicon";
import Icon from "./Icon";
import { JUST_NOMINATED_KEY } from "./NominationBoard";
import ShareRow from "./ShareRow";
import SiteChrome, { type ChromeStory } from "./SiteChrome";

const SEARCH_MS = 250;

type Step =
  | { kind: "search" }
  | { kind: "confirm"; company: CompanyMatch; viaSite: boolean }
  | { kind: "done"; company: CompanyMatch };

function CompanyCard({ c }: { c: CompanyMatch }) {
  return (
    <div className="cocard">
      <Favicon domain={c.domain} name={c.display_name} size={44} />
      <div>
        <b>{c.display_name}</b>
        {c.aliases.length > 0 ? <small>{c.aliases.join(" · ")}</small> : null}
        <a
          href={`https://${c.domain}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {c.domain}
          <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/**
 * `/nominate` (spec v6 §4): company name -> pick a match (or give the
 * official website) -> confirm -> done. No email, no reason, no cap.
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
  const [searched, setSearched] = useState("");
  const [showSite, setShowSite] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const siteInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = name.trim();
    if (!q) {
      setMatches([]);
      setSearched("");
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("resolve_company", { q });
      if (!live) return;
      setMatches((data as CompanyMatch[] | null) ?? []);
      setSearched(q);
    }, SEARCH_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name, supabase]);

  const noMatch =
    searched !== "" && searched === name.trim() && matches.length === 0;
  const siteOpen = showSite || noMatch;

  async function resolveSite(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErr("請先輸入公司名稱。");
      nameInput.current?.focus();
      return;
    }
    if (!site.trim()) {
      setErr("請輸入官方網站。");
      siteInput.current?.focus();
      return;
    }
    setErr("");
    setBusy(true);
    const { data, error } = await supabase.rpc("resolve_domain", {
      url: site.trim(),
      name: name.trim(),
    });
    setBusy(false);
    if (error) {
      setErr(errText(error));
      return;
    }
    setStep({ kind: "confirm", company: data as CompanyMatch, viaSite: true });
  }

  async function nominate(c: CompanyMatch) {
    setErr("");
    setBusy(true);
    const { data, error } = await supabase.rpc("nominate_company", {
      p_domain: c.domain,
      p_display_name: name.trim() || c.display_name,
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
    setStep({ kind: "done", company: (data as CompanyMatch | null) ?? c });
  }

  function restart() {
    setStep({ kind: "search" });
    setName("");
    setSite("");
    setMatches([]);
    setSearched("");
    setShowSite(false);
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
        <p>這家公司已被提名。名單大約每小時更新。</p>
        <div className="after">
          <button type="button" className="btn btn--red" onClick={restart}>
            再提名一家
            <Icon icon={ArrowRight} />
          </button>
          <Link className="btn btn--ghost" href="/#board">
            看看候選名單
          </Link>
        </div>
        <ShareRow
          text={`我提名了 ${c.display_name}：過去五年最值得作為日本市場發展案例的台灣新創。你呢？`}
        />
      </div>
    );
  } else if (step.kind === "confirm") {
    const c = step.company;
    body = (
      <div className="flow">
        <h3>是這家公司嗎？</h3>
        <CompanyCard c={c} />
        {step.viaSite ? (
          <p className="fine">
            我們會以官方網站辨識公司，名稱之後可能統一為市場常用的品牌名。
          </p>
        ) : null}
        {err ? <p className="err">{err}</p> : null}
        <div className="after">
          <button
            type="button"
            className="btn btn--red"
            disabled={busy}
            onClick={() => void nominate(c)}
          >
            {busy ? "提名中…" : "對，提名這家"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => {
              setStep({ kind: "search" });
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

        {matches.length > 0 ? (
          <ul className="matches" aria-label="搜尋結果">
            {matches.map((m) => (
              <li key={m.domain}>
                <button
                  type="button"
                  onClick={() =>
                    setStep({ kind: "confirm", company: m, viaSite: false })
                  }
                >
                  <Favicon domain={m.domain} name={m.display_name} />
                  <span className="co">
                    <b>{m.display_name}</b>
                    {m.aliases.length > 0 ? (
                      <small>{m.aliases.join(" · ")}</small>
                    ) : null}
                  </span>
                  <span className="dom">{m.domain}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {noMatch ? (
          <p className="fine">
            輸入它的官方網站，我們會用網域辨識是哪一家公司。
          </p>
        ) : null}

        {!siteOpen && name.trim() ? (
          <button
            type="button"
            className="linkish"
            onClick={() => setShowSite(true)}
          >
            列表裡沒有
          </button>
        ) : null}

        {siteOpen ? (
          <form className="siteform" noValidate onSubmit={resolveSite}>
            <div className="f">
              <label htmlFor="site">
                <Icon icon={Globe} />
                官方網站
              </label>
              <div className="inline">
                <input
                  id="site"
                  ref={siteInput}
                  value={site}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="https://"
                  onChange={(e) => {
                    setSite(e.target.value);
                    setErr("");
                  }}
                />
                <button
                  className="btn btn--brand"
                  type="submit"
                  disabled={busy}
                >
                  {busy ? "查詢中…" : "下一步"}
                  <Icon icon={ArrowRight} />
                </button>
              </div>
            </div>
          </form>
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
        </div>
      </div>
    </SiteChrome>
  );
}
