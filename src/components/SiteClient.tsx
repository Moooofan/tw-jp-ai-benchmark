"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { dateRange, monthDay } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import {
  EMPTY_STATE,
  type MyState,
  type Phase,
  type PublicFinalist,
  type PublicPost,
  type Stats,
} from "@/lib/types";
import { useEmailGate } from "./EmailGate";
import Modal from "./Modal";

const REFRESH_MS = 20_000;
const SUGGEST_MS = 250;
const PAGE = 12;
const REASON_MIN = 60;
const REASON_MAX = 200;
const DEFAULT_LINK = "https://ximu.ai/";

const DISCLAIMER =
  "本活動反映社群關注與市場認知，不構成企業赴日業績的客觀排名。";
const WORDMARK = "AI Representation Benchmark";

/** Running section numbers (01, 02, …) so a hidden phase leaves no gap. */
function makeCounter() {
  let n = 0;
  return () => String(++n).padStart(2, "0");
}

function SecHead({ num, title }: { num: string; title: string }) {
  return (
    <div className="sec-head">
      <span className="num">{num}</span>
      <h2>{title}</h2>
    </div>
  );
}

export default function SiteClient({
  stats,
  posts: serverPosts,
  finalists,
}: {
  stats: Stats;
  posts: PublicPost[];
  finalists: PublicFinalist[];
}) {
  const supabase = getBrowserClient();
  const router = useRouter();
  const gate = useEmailGate();

  const [posts, setPosts] = useState<PublicPost[]>(serverPosts);
  const [mine, setMine] = useState<MyState>(EMPTY_STATE);
  const [shown, setShown] = useState(PAGE);
  const [thanks, setThanks] = useState(false);

  useEffect(() => setPosts(serverPosts), [serverPosts]);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  const loadMine = useCallback(async () => {
    if (!gate.signedIn) {
      setMine(EMPTY_STATE);
      return;
    }
    const { data } = await supabase.rpc("my_state");
    if (data) {
      const d = data as Partial<MyState>;
      setMine({
        votes: d.votes ?? {},
        picks: d.picks ?? [],
        reports: d.reports ?? [],
      });
    }
  }, [gate.signedIn, supabase]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const phase: Phase = stats.phase;
  const num = makeCounter();

  const headerCta =
    phase === "nominate"
      ? { label: "提名台灣新創", href: "#nominate" }
      : phase === "vote"
        ? { label: "立即投票", href: "#nominate" }
        : phase === "results"
          ? { label: "查看結果", href: "#results" }
          : { label: "查看活動方式", href: "#how" };

  const sorted = useMemo(
    () =>
      posts
        .slice()
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [posts],
  );

  /** Endorse / doubt. Writes `votes`; only the caller's own state is shown. */
  function endorse(post: PublicPost, dir: 1 | -1) {
    gate.require(async () => {
      const prev = mine.votes[post.id] ?? 0;
      const next = prev === dir ? 0 : dir;
      setMine((m) => ({ ...m, votes: { ...m.votes, [post.id]: next } }));
      const { error } = await supabase.rpc("cast_vote", {
        p_post: post.id,
        p_dir: dir,
      });
      if (error) {
        setMine((m) => ({ ...m, votes: { ...m.votes, [post.id]: prev } }));
        window.alert(errText(error));
      }
    });
  }

  return (
    <>
      <div className="wrap">
        <div className="util">
          <div>
            <span>2026 年 9 月</span>
            <span>第 1 期 · 台灣 → 日本</span>
          </div>
          <div>
            <span className="lang-on">繁體中文</span>
            <span>English</span>
          </div>
        </div>

        <header className="mast">
          <div className="mast__mark">
            <span className="mast__bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <div className="mast__word">
              {WORDMARK}
              <small>Taiwan → Japan · 2026</small>
            </div>
          </div>
          <nav>
            <a href="#how">活動方式</a>
            <a href="#nominate">提名</a>
            <a href="#rules">規則與方法</a>
            <a href="#faq">FAQ</a>
          </nav>
          <a className="cta cta--fill" href={headerCta.href}>
            {headerCta.label}
          </a>
        </header>

        <section className="hero">
          <div>
            <span className="eyebrow">
              Taiwan → Japan AI Representation Benchmark 2026
            </span>
            <h1>
              哪些台灣新創，
              <br />
              最值得作為
              <br />
              <em>日本市場</em>發展案例？
            </h1>
            <p className="stand">
              由台灣新創社群共同提名與投票，選出 Community Top 10。前三高票公司將獲得
              IQ Lite Japan Edition，進一步檢視它們在日本 AI
              決策環境中如何被看見、理解與推薦。
            </p>
            <div className="hero__cta">
              <a className="cta cta--passion" href="#nominate">
                提名最多三家公司
              </a>
              <a className="cta" href="#how">
                查看活動方式
              </a>
            </div>
            <p className="disc">
              <b>方法與限制</b>
              {DISCLAIMER}
            </p>
          </div>
          <Schedule stats={stats} />
        </section>

        {phase === "results" ? (
          <Results num={num()} finalists={finalists} />
        ) : null}

        <section id="why">
          <SecHead
            num={num()}
            title="在台灣被看見，不代表在日本的 AI 世界也被看見"
          />
          <div className="two">
            <p className="lede">
              越來越多日本企業與使用者透過 AI
              尋找供應商、比較方案、做出第一輪判斷。一家台灣新創在日本市場的存在感，正在由
              AI 的答案決定。這個 Benchmark 要回答的，是市場看不到的三個問題。
            </p>
            <div>
              <ol className="qs">
                <li>當日本使用者詢問相關產品或服務時，AI 是否會提到這家公司？</li>
                <li>AI 如何描述它的定位、能力與競爭者？</li>
                <li>AI 的答案引用哪些來源，又缺少哪些可信資訊？</li>
              </ol>
              <p className="close">
                Taiwan → Japan AI Representation Benchmark
                將以社群提名建立案例池，再用 ximu 與 Human Analyst Review 分析市場看不到的
                AI Representation。
              </p>
            </div>
          </div>
        </section>

        <section id="how">
          <SecHead num={num()} title="活動方式" />
          <HowItWorks phase={phase} />
          <p className="note">
            <a href="#rules">查看完整活動規則 →</a>
          </p>
        </section>

        {phase === "nominate" ? (
          <NominateSection
            num={num()}
            gate={gate}
            onDone={() => {
              setThanks(true);
              router.refresh();
              void loadMine();
            }}
          />
        ) : phase === "vote" ? (
          <VoteSection
            num={num()}
            gate={gate}
            finalists={finalists}
            picks={mine.picks}
            onPicks={(picks) => setMine((m) => ({ ...m, picks }))}
            onDone={() => setThanks(true)}
          />
        ) : phase === "pre" ? (
          <PreNoticeSection num={num()} stats={stats} />
        ) : phase === "closed" ? (
          <ClosedNoticeSection num={num()} stats={stats} />
        ) : null}

        {phase === "nominate" ? (
          <section id="recent">
            <SecHead num={num()} title="社群最近提名" />
            <p className="counts">
              <span>
                <b>{stats.people}</b>位社群成員參與
              </span>
              <span>
                <b>{stats.companies}</b>家公司被提名
              </span>
            </p>
            {sorted.length === 0 ? (
              <p className="empty">目前還沒有公開的提名。</p>
            ) : (
              <div>
                {sorted.slice(0, shown).map((p) => (
                  <article className="letter" key={p.id}>
                    <div>
                      <p className="who">
                        <b>{p.company}</b>
                        {p.company_en ? (
                          <span className="en">{p.company_en}</span>
                        ) : null}
                        {" · 投書："}
                        {p.masked_email}
                        {" · "}
                        {monthDay(p.created_at)}
                      </p>
                      <p className="body">{p.reason}</p>
                    </div>
                    <div className="endorse">
                      <button
                        type="button"
                        className={mine.votes[p.id] === 1 ? "on" : ""}
                        onClick={() => endorse(p, 1)}
                      >
                        附議
                      </button>
                      <button
                        type="button"
                        className={
                          mine.votes[p.id] === -1 ? "doubt on" : "doubt"
                        }
                        onClick={() => endorse(p, -1)}
                      >
                        存疑
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            {sorted.length > shown ? (
              <div className="more">
                <button
                  className="cta"
                  type="button"
                  onClick={() => setShown((s) => s + PAGE)}
                >
                  載入更多
                </button>
              </div>
            ) : null}
            <p className="note">
              提名經主辦團隊清理與資格檢查後，才會成為第二階段的正式選項。第一階段不公開即時排名或逐名票數。
            </p>
          </section>
        ) : null}

        <section id="prize">
          <SecHead num={num()} title="Top 3 Featured Companies 將獲得什麼" />
          <div className="two">
            <div>
              <p className="lede">
                前三高票公司各獲得一份 IQ Lite Japan
                Edition，由 ximu Intelligence 加 Human Analyst Review 完成並公開。
              </p>
              <span className="valuetag">IQ Lite 定價 US$180</span>
              <p className="note">報告將在取得必要授權後公開提供下載。</p>
            </div>
            <ul className="gets">
              <li>IQ Lite Japan Edition 報告一份</li>
              <li>ximu Intelligence 分析與 Human Analyst Review</li>
              <li>日本市場的 AI Representation 診斷</li>
              <li>來源與引用環境檢視</li>
              <li>競爭定位比較</li>
              <li>目前最值得處理的優先行動</li>
              <li>公開案例曝光</li>
            </ul>
          </div>
        </section>

        <section id="iqlite">
          <SecHead num={num()} title="一份 IQ Lite 回答三個完整問題" />
          <div className="pillars">
            <div className="pillar">
              <h3>See</h3>
              <p>AI 如何理解與描述這家公司？</p>
            </div>
            <div className="pillar">
              <h3>Compare</h3>
              <p>公司與主要競爭者在 AI 答案中有何不同？</p>
            </div>
            <div className="pillar">
              <h3>Decide</h3>
              <p>目前最值得優先處理的三項行動是什麼？</p>
            </div>
          </div>
          <p className="note">
            IQ Lite 提供一次性的市場 Snapshot。ximu 用於持續觀察市場、Query、競爭狀態與
            AI Representation 的變化。
          </p>
        </section>

        <section id="rules">
          <SecHead num={num()} title="規則與方法" />
          <div className="two">
            <div className="method">
              <span className="eyebrow">編輯部說明</span>
              <p>
                {DISCLAIMER}
                正式名稱使用 Community Top 10 與 3 Most Voted Featured
                Companies。第一階段的提名不會自動成為投票選項，所有提名先經後台清理；第二階段才公布統一
                Shortlist，確保所有候選公司在同一組選項中被比較。
              </p>
            </div>
            <div className="acc">
              <details>
                <summary>資格</summary>
                <div className="a">
                  成立於台灣或以台灣為主要營運基地之新創，且已在日本市場有公開可查之活動。
                </div>
              </details>
              <details>
                <summary>期間</summary>
                <div className="a">
                  提名期間 {dateRange(stats.nominate_open, stats.nominate_close)}
                  ；投票期間 {dateRange(stats.vote_open, stats.vote_close)}
                  ；結果公布 {stats.results_label}。
                </div>
              </details>
              <details>
                <summary>資料用途</summary>
                <div className="a">
                  Email 僅用於去重、驗證與結果通知，不公開、不作行銷使用。
                </div>
              </details>
              <details>
                <summary>異常票處理</summary>
                <div className="a">
                  Email 去重、驗證、後台清理，主辦團隊保留移除異常票的權利。
                </div>
              </details>
              <details>
                <summary>同票處理</summary>
                <div className="a">
                  同票者並列，以提名階段附議數作為次序參考。
                </div>
              </details>
              <details>
                <summary>結果公告方式</summary>
                <div className="a">於本頁公布，並以 Email 通知參與者。</div>
              </details>
            </div>
          </div>
        </section>

        <section id="faq">
          <SecHead num={num()} title="FAQ" />
          <div className="acc" style={{ maxWidth: 760 }}>
            <details>
              <summary>可以提名自己的公司嗎？</summary>
              <div className="a">可以，提名理由需具體。</div>
            </details>
            <details>
              <summary>為什麼第一階段看不到票數？</summary>
              <div className="a">
                為避免動員與誤讀，第一階段只顯示近期提名與參與人數，第二階段才以統一名單比較。
              </div>
            </details>
            <details>
              <summary>前三名會得到什麼？</summary>
              <div className="a">
                一份 IQ Lite Japan Edition，回答三件事：AI
                如何理解與描述這家公司、公司與主要競爭者在 AI
                答案中有何不同、目前最值得優先處理的行動。報告將在取得必要授權後公開提供下載。
              </div>
            </details>
          </div>
        </section>

        <section id="convert">
          <SecHead num={num()} title="從 Benchmark 到你自己的市場位置" />
          <div className="convert">
            <div>
              <h3>想看見自己的市場位置？</h3>
              <p>取得一份針對單一市場與商業問題的標準化 AI Representation 診斷。</p>
              <a
                className="cta cta--fill"
                href={stats.iqlite_url || DEFAULT_LINK}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get Your IQ Lite — US$180
              </a>
            </div>
            <div>
              <h3>想持續掌握市場如何改變？</h3>
              <p>
                IQ Lite 提供一次性的市場 Snapshot；ximu
                用於持續觀察市場、Query、競爭狀態與 AI Representation 的變化。
              </p>
              <a
                className="cta"
                href={stats.ximu_url || DEFAULT_LINK}
                target="_blank"
                rel="noopener noreferrer"
              >
                Start with ximu
              </a>
            </div>
          </div>
        </section>

        <section id="partners" style={{ paddingTop: 0 }}>
          <div className="partners">
            <span className="eyebrow">Ecosystem and Media Partners</span>
            <p>{stats.partners_text}</p>
          </div>
        </section>
      </div>

      <footer>
        <div className="wrap colo">
          <div>
            <p className="word">{WORDMARK} · Taiwan → Japan 2026</p>
            <p>{DISCLAIMER}</p>
          </div>
          <div>
            <p>
              <a href="#rules">規則與方法</a>
            </p>
            <p>
              <a href="#faq">FAQ</a>
            </p>
          </div>
          <div>
            {stats.contact_email ? (
              <p>
                聯絡：
                <a href={`mailto:${stats.contact_email}`}>
                  {stats.contact_email}
                </a>
              </p>
            ) : null}
            <p>© 2026 ximu</p>
          </div>
        </div>
      </footer>

      {gate.modal}

      <Modal open={thanks} onClose={() => setThanks(false)}>
        <h3>感謝參與。</h3>
        <p>結果預計於 {stats.results_label}公布。</p>
        <ShareRow />
        <button
          className="cta"
          type="button"
          onClick={() => setThanks(false)}
        >
          關閉
        </button>
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------ schedule */

function Schedule({ stats }: { stats: Stats }) {
  const rows: { k: string; v: string; s: string; now: boolean }[] = [
    {
      k: "提名期間",
      v: dateRange(stats.nominate_open, stats.nominate_close),
      s: "每人最多提名三家公司",
      now: stats.phase === "nominate",
    },
    {
      k: "投票期間",
      v: dateRange(stats.vote_open, stats.vote_close),
      s: "從 Community Shortlist 選出最多三家",
      now: stats.phase === "vote",
    },
    {
      k: "結果公布",
      v: stats.results_label,
      s: "Community Top 10 與 3 Most Voted Featured Companies",
      now: stats.phase === "results" || stats.phase === "closed",
    },
  ];
  return (
    <aside className="sched" aria-label="時程">
      {rows.map((r) => (
        <div className={r.now ? "row now" : "row"} key={r.k}>
          <span className="k">{r.k}</span>
          <span className="v">
            {r.v}
            <small>{r.s}</small>
          </span>
        </div>
      ))}
    </aside>
  );
}

/* -------------------------------------------------------- how it works */

function HowItWorks({ phase }: { phase: Phase }) {
  const steps = [
    {
      h: "社群公開提名",
      p: "每人最多提名三家台灣新創。",
      now: phase === "nominate",
    },
    {
      h: "形成 Shortlist",
      p: "主辦團隊清理公司名稱、檢查資格並形成 Top 10–12 候選名單。",
      now: false,
    },
    {
      h: "社群正式投票",
      p: "每個 Email 最多投三家公司，產生 Community Top 10 與 Top 3。",
      now: phase === "vote",
    },
    {
      h: "ximu 分析與公開發布",
      p: "前三高票公司獲得 IQ Lite Japan Edition，報告與 Benchmark 將公開提供下載。",
      now: phase === "results",
    },
  ];
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <div className={s.now ? "step now" : "step"} key={s.h}>
          <div className="num">{i + 1}</div>
          <h3>{s.h}</h3>
          <p>{s.p}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- sharing */

function ShareRow() {
  const [copied, setCopied] = useState(false);
  const text =
    "Taiwan → Japan AI Representation Benchmark 2026：哪些台灣新創，最值得作為日本市場發展案例？";
  const url =
    typeof window === "undefined" ? "" : window.location.origin + "/";
  const open = (u: string) => window.open(u, "_blank", "noopener");
  return (
    <div className="share">
      <button
        type="button"
        onClick={() =>
          open(
            "https://x.com/intent/post?text=" +
              encodeURIComponent(text) +
              "&url=" +
              encodeURIComponent(url),
          )
        }
      >
        分享到 X
      </button>
      <button
        type="button"
        onClick={() =>
          open(
            "https://line.me/R/share?text=" + encodeURIComponent(`${text} ${url}`),
          )
        }
      >
        分享到 LINE
      </button>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(`${text} ${url}`);
          setCopied(true);
        }}
      >
        {copied ? "已複製連結" : "複製連結"}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- notices */

/** Shown before nominate_open: the hero and schedule stay, only the form waits. */
function PreNoticeSection({ num, stats }: { num: string; stats: Stats }) {
  return (
    <section id="nominate">
      <SecHead num={num} title="提名尚未開放" />
      <p className="empty">提名將於 {monthDay(stats.nominate_open)} 開放。</p>
    </section>
  );
}

/** Shown after vote_close, before results are announced. */
function ClosedNoticeSection({ num, stats }: { num: string; stats: Stats }) {
  return (
    <section id="nominate">
      <SecHead num={num} title="投票已結束" />
      <p className="empty">
        投票已結束。結果預計於 {stats.results_label} 公布。
      </p>
    </section>
  );
}

/* ------------------------------------------------------------ nominate */

function NominateSection({
  num,
  gate,
  onDone,
}: {
  num: string;
  gate: ReturnType<typeof useEmailGate>;
  onDone: () => void;
}) {
  const supabase = getBrowserClient();
  const [company, setCompany] = useState("");
  const [companyEn, setCompanyEn] = useState("");
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [suggest, setSuggest] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = company.trim();
    if (!q) {
      setSuggest([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("company_suggest", { q });
      setSuggest(
        ((data as { company: string }[] | null) ?? [])
          .map((r) => r.company)
          .filter((n) => n.toLowerCase() !== q.toLowerCase())
          .slice(0, 4),
      );
    }, SUGGEST_MS);
    return () => clearTimeout(t);
  }, [company, supabase]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = company.trim();
    const ce = companyEn.trim();
    const u = url.trim();
    const w = reason.trim();
    const m = email.trim();
    if (!c) {
      setErr("請填寫公司中文名稱。");
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      setErr("官方網址請以 http:// 或 https:// 開頭。");
      return;
    }
    if (w.length < REASON_MIN || w.length > REASON_MAX) {
      setErr("理由請寫 60 到 200 字");
      return;
    }
    if (m && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) {
      setErr("請確認 Email 格式。");
      return;
    }
    setErr("");
    gate.require(async () => {
      setBusy(true);
      const { error } = await supabase.rpc("nominate", {
        p_company: c,
        p_company_en: ce,
        p_url: u,
        p_reason: w,
      });
      setBusy(false);
      if (error) {
        setErr(errText(error));
        return;
      }
      setCompany("");
      setCompanyEn("");
      setUrl("");
      setReason("");
      setSuggest([]);
      onDone();
    }, m);
  }

  const over = reason.length > REASON_MAX;

  return (
    <section id="nominate">
      <SecHead num={num} title="提名你認為最值得觀察的台灣赴日新創" />
      <p className="lede" style={{ maxWidth: "40em", marginBottom: 24 }}>
        每人最多提名三家公司。請提供公司中英文名稱、官方網址，以及你認為它值得被觀察的理由。
      </p>
      <form className="form" noValidate onSubmit={submit}>
        <div className="f">
          <label htmlFor="zh">
            <span className="n">01</span>公司中文名稱
          </label>
          <input
            id="zh"
            value={company}
            maxLength={40}
            autoComplete="off"
            placeholder="例：某某科技"
            onChange={(e) => {
              setCompany(e.target.value);
              setErr("");
            }}
          />
          {suggest.length > 0 ? (
            <div className="suggest">
              {suggest.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setCompany(n);
                    setSuggest([]);
                  }}
                >
                  已有人提名：{n}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="f">
          <label htmlFor="en">
            <span className="n">02</span>公司英文名稱
          </label>
          <input
            id="en"
            value={companyEn}
            maxLength={80}
            autoComplete="off"
            placeholder="Example Inc."
            onChange={(e) => setCompanyEn(e.target.value)}
          />
        </div>
        <div className="f full">
          <label htmlFor="url">
            <span className="n">03</span>官方網址
          </label>
          <input
            id="url"
            type="url"
            value={url}
            placeholder="https://"
            onChange={(e) => {
              setUrl(e.target.value);
              setErr("");
            }}
          />
        </div>
        <div className="f full">
          <label htmlFor="why">
            <span className="n">04</span>提名理由
          </label>
          <textarea
            id="why"
            value={reason}
            maxLength={REASON_MAX}
            placeholder="它在日本市場做了什麼、為什麼值得被觀察（60–200 字）"
            onChange={(e) => {
              setReason(e.target.value);
              setErr("");
            }}
          />
          <p className="hint">
            <span>具體的事實比形容詞有用。</span>
            <span className={over ? "over" : undefined}>
              {reason.length}/{REASON_MAX}
            </span>
          </p>
        </div>
        <div className="f full">
          <label htmlFor="mail">
            <span className="n">05</span>你的 Email
          </label>
          <input
            id="mail"
            type="email"
            value={email}
            autoComplete="email"
            placeholder="name@company.com"
            onChange={(e) => {
              setEmail(e.target.value);
              setErr("");
            }}
          />
          <p className="hint">
            <span>Email 僅用於去重與驗證，不公開，不作行銷使用。</span>
          </p>
          {err ? <p className="err">{err}</p> : null}
        </div>
        <div className="form__foot">
          <button className="cta cta--fill" type="submit" disabled={busy}>
            {busy ? "送出中…" : "送出提名"}
          </button>
          <p className="fine">
            送出後將寄出 6 位數驗證碼；驗證一次後 30 天內免再驗。
          </p>
        </div>
      </form>
    </section>
  );
}

/* ---------------------------------------------------------------- vote */

function VoteSection({
  num,
  gate,
  finalists,
  picks,
  onPicks,
  onDone,
}: {
  num: string;
  gate: ReturnType<typeof useEmailGate>;
  finalists: PublicFinalist[];
  picks: string[];
  onPicks: (picks: string[]) => void;
  onDone: () => void;
}) {
  const supabase = getBrowserClient();
  const [msg, setMsg] = useState<string | null>(null);
  const used = picks.length;

  function toggle(f: PublicFinalist) {
    gate.require(async () => {
      setMsg(null);
      if (!picks.includes(f.id) && used >= 3) {
        setMsg("每個 Email 最多投三家，請先取消一家。");
        return;
      }
      const { data, error } = await supabase.rpc("cast_final_vote", {
        p_finalist: f.id,
      });
      if (error) {
        setMsg(errText(error));
        return;
      }
      const next = (data as string[] | null) ?? [];
      onPicks(next);
      if (next.length === 3) onDone();
    });
  }

  return (
    <section id="nominate">
      <SecHead num={num} title="從 Community Shortlist 選出最多三家公司" />
      <p className="lede" style={{ maxWidth: "44em", marginBottom: 24 }}>
        以下名單由第一階段提名整理而成，公司名稱已統一、資格已確認。每個 Email
        最多投三家。
      </p>
      <p className="picks">
        <span>你的選擇</span>
        <span className="pips">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < used ? "pip on" : "pip"} />
          ))}
        </span>
        <span>{msg ?? `已選 ${used} / 3`}</span>
      </p>
      {finalists.length === 0 ? (
        <p className="empty">Shortlist 尚未公布。</p>
      ) : (
        <div className="cards">
          {finalists.map((f) => {
            const on = picks.includes(f.id);
            return (
              <div className="card" key={f.id}>
                <h3>{f.company}</h3>
                {f.name_en ? <p className="en">{f.name_en}</p> : null}
                {f.industry ? <span className="tag">{f.industry}</span> : null}
                {f.one_liner ? <p className="one">{f.one_liner}</p> : null}
                {f.jp_info ? <p className="jp">{f.jp_info}</p> : null}
                <div className="foot">
                  <button
                    className={on ? "cta cta--fill" : "cta"}
                    type="button"
                    onClick={() => toggle(f)}
                  >
                    {on ? "已選擇" : "選擇這家"}
                  </button>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer">
                      官方網址
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="note">
        投票期間不公開票數、排名或目前領先狀態。結果將於公布日一次揭曉。
      </p>
    </section>
  );
}

/* ------------------------------------------------------------- results */

function Results({
  num,
  finalists,
}: {
  num: string;
  finalists: PublicFinalist[];
}) {
  const ranked = finalists
    .slice()
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.sort - b.sort);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3, 10);

  return (
    <section id="results">
      <SecHead
        num={num}
        title="Community Top 10 與 3 Most Voted Featured Companies"
      />
      <p className="lede" style={{ maxWidth: "46em", marginBottom: 24 }}>
        本結果由社群提名與投票產生，代表市場認知與關注，不等於日本發展成效的客觀前三名。
      </p>
      {top.length === 0 ? (
        <p className="empty">結果尚未公布。</p>
      ) : (
        <div className="podium">
          {top.map((f, i) => (
            <div className="card" key={f.id}>
              <span className="rank">{String(i + 1).padStart(2, "0")}</span>
              <h3>{f.company}</h3>
              {f.name_en ? <p className="en">{f.name_en}</p> : null}
              {f.one_liner ? <p className="one">{f.one_liner}</p> : null}
              {f.top_reason ? <blockquote>「{f.top_reason}」</blockquote> : null}
              <div className="foot">
                <span className="votes">{f.votes ?? 0} 票</span>
                {f.report_url ? (
                  <a
                    href={f.report_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    閱讀報告
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 ? (
        <div className="toplist">
          {rest.map((f, i) => (
            <div className="r" key={f.id}>
              <span className="n">{String(i + 4).padStart(2, "0")}</span>
              <span className="co">
                {f.company}
                {f.name_en ? <span>{f.name_en}</span> : null}
              </span>
              <span className="v">{f.votes ?? 0} 票</span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="note">報告將在取得必要授權後公開提供下載。</p>
    </section>
  );
}
