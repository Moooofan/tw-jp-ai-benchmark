"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  Globe,
  Mail,
  PenLine,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import { isNameKey, monthDay, nameKey } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { CompanyMatch, Stats } from "@/lib/types";
import Favicon from "./Favicon";
import Icon from "./Icon";
import { JUST_NOMINATED_KEY } from "./NominationBoard";
import { readSavedEmail, writeSavedEmail } from "./ParticipantEmail";
import ShareRow from "./ShareRow";
import SiteChrome, { type ChromeStory } from "./SiteChrome";

const SEARCH_MS = 250;
const REASON_MIN = 10;
const REASON_MAX = 50;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_ERR = "請填寫正確的 Email。";

/** Same normalisation as nominate_company(): collapse whitespace, trim. */
const cleanReason = (s: string) => s.replace(/\s+/g, " ").trim();

/** Same normalisation as the name key: collapse whitespace, trim. */
const cleanName = (s: string) => s.replace(/\s+/g, " ").trim();
const NAME_MIN = 2;

/**
 * `typed`: the company was not in the list and is nominated by its typed name
 * (v6n) — the website is optional and the database keys it as `name:…`.
 */
type Step =
  | { kind: "search" }
  | { kind: "confirm"; company: CompanyMatch; typed: boolean }
  | { kind: "done"; company: CompanyMatch; reason: string };

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
 * `/nominate` (spec v6 §4): company name + email -> pick a match (or nominate
 * the typed name directly, website optional, v6n) -> confirm + 10–50
 * character reason -> done. No cap. The reason requirement (v6r) overrides the
 * v6 spec's "no reason"; the email field (v6e) is required but never verified
 * and never made public.
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
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEmail(readSavedEmail());
  }, []);

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

  async function nominate(c: CompanyMatch, typedStep: boolean) {
    const r = cleanReason(reason);
    const em = email.trim();
    if (!EMAIL_RE.test(em)) {
      setEmailErr(EMAIL_ERR);
      return;
    }
    setErr("");
    setBusy(true);
    // A `name:` company (typed now, or picked from the list) is sent with no
    // domain: the database derives the key from the name (a website typed on
    // the confirm step is sent instead). For a listed one, send a name that
    // maps back to the same key.
    let pDomain: string | null = c.domain;
    let pName = name.trim() || c.display_name;
    if (isNameKey(c.domain)) {
      pDomain = typedStep ? site.trim() || null : null;
      pName =
        nameKey(c.display_name) === c.domain
          ? c.display_name
          : c.domain.slice("name:".length);
    }
    const { data, error } = await supabase.rpc("nominate_company", {
      p_domain: pDomain,
      p_display_name: pName,
      p_reason: r,
      p_email: em,
    });
    setBusy(false);
    if (error) {
      setErr(errText(error));
      return;
    }
    writeSavedEmail(em);
    try {
      window.sessionStorage.setItem(JUST_NOMINATED_KEY, "1");
    } catch {
      /* storage unavailable */
    }
    setStep({
      kind: "done",
      company: (data as CompanyMatch | null) ?? c,
      reason: r,
    });
  }

  function restart() {
    setStep({ kind: "search" });
    setName("");
    setSite("");
    setMatches([]);
    setSearched("");
    setReason("");
    setErr("");
    setEmailErr("");
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
        <blockquote className="reasonquote">{step.reason}</blockquote>
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
          text={`我提名了 ${c.display_name}：${step.reason}　過去五年，你認為哪些台灣新創最值得作為日本市場發展案例？`}
        />
      </div>
    );
  } else if (step.kind === "confirm") {
    const c = step.company;
    const len = cleanReason(reason).length;
    const reasonOk = len >= REASON_MIN && len <= REASON_MAX;
    const emailOk = EMAIL_RE.test(email.trim());
    body = (
      <div className="flow">
        <h3>{step.typed ? "提名這家公司" : "是這家公司嗎？"}</h3>
        <CompanyCard c={c} />
        {step.typed ? (
          <>
            <p className="fine">我們會再確認這家公司的官方網站。</p>
            <div className="f">
              <label htmlFor="site">
                <Icon icon={Globe} />
                官方網站（選填）
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
                知道的話填一下，能幫我們更快辨識。
              </p>
            </div>
          </>
        ) : null}
        <div className="f">
          <label htmlFor="reason">
            <Icon icon={PenLine} />
            為什麼提名這家公司？
          </label>
          <textarea
            id="reason"
            className="reasonbox"
            rows={3}
            value={reason}
            maxLength={120}
            placeholder="一句話就好，例如它在日本做了什麼（10–50 字）"
            aria-describedby="reason-count"
            onChange={(e) => {
              setReason(e.target.value);
              setErr("");
            }}
          />
          <small
            id="reason-count"
            className={`reasoncount${len > REASON_MAX ? " is-over" : ""}`}
            aria-live="polite"
          >
            {len} / {REASON_MAX}
          </small>
        </div>
        {err ? <p className="err">{err}</p> : null}
        <div className="after">
          <button
            type="button"
            className="btn btn--red"
            disabled={busy || !reasonOk || !emailOk}
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

        <div className="f">
          <label htmlFor="email">
            <Icon icon={Mail} />
            你的 Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailErr("");
              setErr("");
            }}
            onBlur={() => {
              if (!EMAIL_RE.test(email.trim())) setEmailErr(EMAIL_ERR);
            }}
          />
          <p className="fine">只用來聯繫與避免重複，不會公開。</p>
          {emailErr ? <p className="err">{emailErr}</p> : null}
        </div>

        {matches.length > 0 || offerTyped ? (
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
          <p>輸入公司名稱，確認公司，再寫一句為什麼。</p>
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
