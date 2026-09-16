"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ListChecks,
  Mail,
  MessageSquareText,
  SquareCheckBig,
  X,
} from "lucide-react";
import { dateRange, monthDay } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import { clientId } from "@/lib/client-id";
import type { MyVoteState, Stats } from "@/lib/types";
import CompanyPicker, { type Picked } from "./CompanyPicker";
import Favicon from "./Favicon";
import Icon from "./Icon";
import {
  ensureAnonSession,
  readSavedEmail,
  writeSavedEmail,
} from "./ParticipantEmail";
import ShareRow from "./ShareRow";
import SiteChrome, { DISCLAIMER } from "./SiteChrome";

const MAX_PICKS = 3;
const MIN_REASON = 10;
const MAX_REASON = 50;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Candidate = { domain: string; display_name: string; aliases: string[] };
type Slot = Candidate & {
  reason: string;
  name: string;
  site: string | null;
  isNew: boolean;
};
type DonePick = { domain: string; display_name: string; reason: string };

/** Identity key for dedup/removal: a typed pick has no domain yet. */
const slotKey = (s: { domain: string; display_name: string }) =>
  s.domain || `typed:${s.display_name.toLowerCase()}`;

/** Mirrors cast_ballot: trim, collapse whitespace, count code points. */
const reasonLength = (s: string) =>
  [...s.trim().replace(/\s+/g, " ")].length;

/** Milliseconds until the next 00:00 in Asia/Taipei (UTC+8, no DST). */
function msToTaipeiMidnight(now = Date.now()): number {
  const day = 86_400_000;
  const tpe = now + 8 * 3_600_000;
  return day - (tpe % day);
}

function Countdown() {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(msToTaipeiMidnight());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  if (ms === null) return null;
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <p className="countdown">
      明天 00:00 可以再投一次
      <span className="countdown__t" aria-label="距離下次投票">
        {pad(Math.floor(s / 3600))}:{pad(Math.floor((s % 3600) / 60))}:
        {pad(s % 60)}
      </span>
    </p>
  );
}

/**
 * `/vote` in vote / closed (spec v7b §2): email -> up to three companies,
 * one reason each -> cast_ballot -> today's ballot, share, come back tomorrow.
 */
export default function BallotClient({
  stats,
  pick,
}: {
  stats: Stats;
  /** `?pick=<domain>` from a company page: preselected when eligible. */
  pick: string;
}) {
  const supabase = getBrowserClient();
  const [email, setEmail] = useState("");
  const [emailOk, setEmailOk] = useState(false);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState<DonePick[] | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const checkedFor = useRef("");
  const picked = useRef(false);

  const open = stats.phase === "vote";

  useEffect(() => {
    const saved = readSavedEmail();
    if (saved) setEmail(saved);
  }, []);

  // Preselect ?pick=<domain> once.
  useEffect(() => {
    if (!open || !pick || picked.current) return;
    picked.current = true;
    void supabase.rpc("vote_candidates", { q: pick }).then(({ data }) => {
      const hit = ((data as Candidate[] | null) ?? []).find(
        (c) => c.domain === pick.toLowerCase(),
      );
      if (hit) {
        setSlots((s) =>
          s.length
            ? s
            : [
                {
                  ...hit,
                  reason: "",
                  name: hit.display_name,
                  site: null,
                  isNew: false,
                },
              ],
        );
      }
    });
  }, [open, pick, supabase]);

  async function checkEmail(): Promise<boolean> {
    const v = email.trim();
    if (!EMAIL_RE.test(v)) {
      setErr("請確認 Email 格式。");
      setEmailOk(false);
      return false;
    }
    setErr("");
    writeSavedEmail(v);
    if (checkedFor.current === v.toLowerCase()) {
      setEmailOk(true);
      return true;
    }
    setChecking(true);
    const { data, error } = await supabase.rpc("my_vote_state", { p_email: v });
    setChecking(false);
    if (error) {
      setErr(errText(error));
      return false;
    }
    checkedFor.current = v.toLowerCase();
    const state = data as MyVoteState;
    if (state.voted_today) {
      setDone(state.today);
      return false;
    }
    setEmailOk(true);
    return true;
  }

  function addPick(c: Picked) {
    setErr("");
    const key = c.domain || `typed:${c.display_name.toLowerCase()}`;
    if (slots.some((s) => slotKey(s) === key)) return;
    if (slots.length >= MAX_PICKS) {
      setErr("每張選票最多選 3 家公司，請先移除一家。");
      return;
    }
    setSlots((s) => [
      ...s,
      {
        domain: c.domain,
        display_name: c.display_name,
        aliases: c.aliases ?? [],
        reason: "",
        name: c.display_name,
        site: c.site,
        isNew: c.isNew,
      },
    ]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!(await checkEmail())) return;
    if (slots.length === 0) {
      setErr("請至少選擇 1 家公司。");
      return;
    }
    if (slots.some((s) => {
      const n = reasonLength(s.reason);
      return n < MIN_REASON || n > MAX_REASON;
    })) {
      setErr("每家公司的理由需要 10–50 個字。");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      await ensureAnonSession();
    } catch (e2) {
      setBusy(false);
      setErr(errText(e2));
      return;
    }
    const picks = slots.map((s) => ({
      domain: s.domain,
      name: s.name,
      site: s.site,
      reason: s.reason.trim().replace(/\s+/g, " "),
    }));
    const { error } = await supabase.rpc("cast_ballot", {
      p_email: email.trim(),
      p_picks: picks,
      p_client_id: clientId(),
    });
    setBusy(false);
    if (error) {
      setErr(errText(error));
      return;
    }
    setDone(
      slots.map((s, i) => ({
        domain: s.domain,
        display_name: s.display_name,
        reason: picks[i].reason,
      })),
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  let body: React.ReactNode;
  if (!open) {
    body =
      stats.phase === "closed" ? (
        <>
          <h3>投票已截止</h3>
          <p>投票已截止，{stats.results_label}直播揭曉。</p>
          <Link className="btn btn--ghost" href="/">
            回到首頁
          </Link>
        </>
      ) : (
        <>
          <h3>投票尚未開始</h3>
          <p>投票將於 {monthDay(stats.vote_open)} 開始。</p>
          <Link className="btn btn--ghost" href="/">
            回到首頁
          </Link>
        </>
      );
  } else if (done) {
    const names = done.map((d) => d.display_name).join("、");
    body = (
      <div className="flow flow--done">
        <span className="okmark" aria-hidden="true">
          ✓
        </span>
        <h3>今天的票已送出！</h3>
        <ol className="donepicks">
          {done.map((d, i) => (
            <li key={d.domain}>
              <span className="slot__no">{i + 1}</span>
              <Favicon domain={d.domain} name={d.display_name} size={32} />
              <div>
                <Link href={`/company/${encodeURIComponent(d.domain)}`}>
                  <b>{d.display_name}</b>
                </Link>
                <p>{d.reason}</p>
              </div>
            </li>
          ))}
        </ol>
        <Countdown />
        <div className="after">
          <Link className="btn btn--red" href="/#leaderboard">
            看排行榜
            <Icon icon={ArrowRight} />
          </Link>
          <Link className="btn btn--ghost" href="/#reasons">
            看熱門理由
          </Link>
        </div>
        {names ? (
          <ShareRow
            text={`我投給了 ${names}：過去五年最值得作為日本市場發展案例的台灣新創。你呢？`}
          />
        ) : null}
      </div>
    );
  } else {
    body = (
      <form className="flow ballotform" noValidate onSubmit={submit}>
        <div className="step">
          <span className="step__k">STEP A</span>
          <div className="f">
            <label htmlFor="ballot-email">
              <Icon icon={Mail} />
              Email
            </label>
            <div className="inline">
              <input
                id="ballot-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailOk(false);
                }}
                onBlur={() => {
                  if (email.trim()) void checkEmail();
                }}
              />
              {!emailOk ? (
                <button
                  type="button"
                  className="btn btn--brand"
                  disabled={checking}
                  onClick={() => void checkEmail()}
                >
                  {checking ? "確認中…" : "繼續"}
                  <Icon icon={ArrowRight} />
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className={emailOk ? "step" : "step step--off"}>
          <span className="step__k">STEP B</span>
          <CompanyPicker
            onPick={addPick}
            disabled={!emailOk || slots.length >= MAX_PICKS}
            pickedDomains={slots.map((s) => s.domain).filter(Boolean)}
          />
          <p className="fine">
            找不到想投的公司嗎？直接搜尋、選「直接提名」就能同時提名它並投下這一票。
          </p>

          <ol className="slots" aria-label="我的選票">
            {Array.from({ length: MAX_PICKS }, (_, i) => {
              const s = slots[i];
              if (!s) {
                return (
                  <li key={`empty-${i}`} className="slot slot--empty">
                    <span className="slot__no">{i + 1}</span>
                    <span>{i === 0 ? "從上方選一家公司" : "可再選一家（選填）"}</span>
                  </li>
                );
              }
              const n = reasonLength(s.reason);
              const bad = s.reason !== "" && (n < MIN_REASON || n > MAX_REASON);
              const key = slotKey(s);
              return (
                <li key={key} className="slot">
                  <div className="slot__head">
                    <span className="slot__no">{i + 1}</span>
                    <Favicon
                      domain={s.domain || `name:${s.display_name}`}
                      name={s.display_name}
                      size={28}
                    />
                    <b>{s.display_name}</b>
                    {s.isNew ? <span className="abadge">新提名</span> : null}
                    <button
                      type="button"
                      className="slot__x"
                      aria-label={`移除 ${s.display_name}`}
                      onClick={() =>
                        setSlots((all) => all.filter((x) => slotKey(x) !== key))
                      }
                    >
                      <X size={18} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                  <textarea
                    aria-label={`為什麼投給 ${s.display_name}`}
                    placeholder="為什麼投給它？一句話就好（10–50 字）"
                    value={s.reason}
                    rows={2}
                    maxLength={80}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSlots((all) =>
                        all.map((x) => (slotKey(x) === key ? { ...x, reason: v } : x)),
                      );
                    }}
                  />
                  <p className="hint">
                    <span>每家公司寫一句 10–50 字的理由</span>
                    <span className={bad ? "over" : undefined}>
                      {n} / {MAX_REASON}
                    </span>
                  </p>
                </li>
              );
            })}
          </ol>
        </div>

        {err ? <p className="err">{err}</p> : null}

        <div className="after">
          <button
            type="submit"
            className="btn btn--red"
            disabled={busy || !emailOk || slots.length === 0}
          >
            {busy ? "送出中…" : "送出今天的票"}
            <Icon icon={ArrowRight} />
          </button>
        </div>
      </form>
    );
  }

  return (
    <SiteChrome stats={stats}>
      <div className="pagehero">
        <div className="wrap">
          <span className="chip">Vote</span>
          <h1>投下今天的一票</h1>
          <p>最多選三家，每家寫一句為什麼。</p>
        </div>
      </div>
      <div className="wrap">
        <div className="split">
          <div className="formcard">{body}</div>
          <aside className="side">
            <span className="k">投票期間</span>
            <span className="v">{dateRange(stats.vote_open, stats.vote_close)}</span>
            <hr />
            <ul className="checks">
              <li>
                <Icon icon={SquareCheckBig} />
                每天一張
              </li>
              <li>
                <Icon icon={ListChecks} />
                最多三家
              </li>
              <li>
                <Icon icon={MessageSquareText} />
                每家一句理由
              </li>
            </ul>
            <hr />
            <p className="fine">
              Email 不公開，只用來確認一人一天一張票。
            </p>
            <p className="fine">{DISCLAIMER}</p>
          </aside>
        </div>
      </div>
    </SiteChrome>
  );
}
