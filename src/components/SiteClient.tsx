"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  Compass,
  Crosshair,
  Eye,
  FileText,
  Flag,
  Info,
  Layers,
  Link as LinkIcon,
  ListChecks,
  ListFilter,
  MapPin,
  Megaphone,
  MessageSquareText,
  Newspaper,
  PenLine,
  Scale,
  Search,
  SquareCheckBig,
  Target,
  TrendingUp,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { dateRange, monthDay } from "@/lib/format";
import {
  type Phase,
  type PublicFinalist,
  type PublicPost,
  type Stats,
} from "@/lib/types";
import Band from "./Band";
import Icon from "./Icon";
import { useParticipantEmail } from "./ParticipantEmail";
import Letters from "./Letters";
import SiteChrome, { DISCLAIMER, headerCta } from "./SiteChrome";

const REFRESH_MS = 20_000;
const RECENT_ON_HOME = 6;
const DEFAULT_LINK = "https://ximu-geo.com/zh-TW";

/* Verbatim copy from prototype/campaign-v5.html, paired with its icons. */
const BACKGROUND: { icon: LucideIcon; h: string; p: string }[] = [
  {
    icon: TrendingUp,
    h: "越來越多台灣新創前進日本",
    p: "從軟體服務、硬體製造到消費品牌，日本成為許多團隊跨出台灣後，優先布局的市場之一。",
  },
  {
    icon: Flag,
    h: "已經有不少公司站穩腳步",
    p: "有人在日本找到長期客戶，有人設立據點、組建在地團隊，一步步建立市場信任。",
  },
  {
    icon: Layers,
    h: "但這些經驗很少被整理在一起",
    p: "成功的做法散落在各自的故事裡，外界很難看清楚：這些公司究竟是怎麼被日本市場認識的。",
  },
];

const QUESTIONS: { icon: LucideIcon; text: string }[] = [
  {
    icon: Search,
    text: "當日本使用者詢問相關產品或服務時，AI 是否會提到這家公司？",
  },
  { icon: MessageSquareText, text: "AI 如何描述它的定位、能力與競爭者？" },
  { icon: LinkIcon, text: "AI 的答案引用哪些來源，又缺少哪些可信資訊？" },
];

const PRIZES: { icon: LucideIcon; text: string }[] = [
  { icon: FileText, text: "IQ Lite Japan Edition 報告一份" },
  { icon: UserCheck, text: "ximu Intelligence 分析與 Human Analyst Review" },
  { icon: Crosshair, text: "日本市場的 AI Representation 診斷" },
  { icon: LinkIcon, text: "來源與引用環境檢視" },
  { icon: Scale, text: "競爭定位比較" },
  { icon: ListChecks, text: "目前最值得處理的優先行動" },
  { icon: Newspaper, text: "公開案例曝光" },
];

const PILLARS: { icon: LucideIcon; h: string; p: string }[] = [
  { icon: Eye, h: "SEE", p: "AI 如何理解與描述這家公司？" },
  { icon: Scale, h: "COMPARE", p: "公司與主要競爭者在 AI 答案中有何不同？" },
  { icon: Target, h: "DECIDE", p: "目前最值得優先處理的三項行動是什麼？" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `9 月 14 日 – 9 月 27 日` → two lines, as in the prototype's panel. */
function Period({ text }: { text: string }) {
  const [a, b] = text.split(" – ");
  if (!b) return <>{text}</>;
  return (
    <>
      {a}
      <br />– {b}
    </>
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
  const router = useRouter();
  const identity = useParticipantEmail();
  const [posts, setPosts] = useState<PublicPost[]>(serverPosts);

  useEffect(() => setPosts(serverPosts), [serverPosts]);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  const phase: Phase = stats.phase;

  const sorted = useMemo(
    () =>
      posts
        .slice()
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [posts],
  );

  const heroCta =
    phase === "nominate"
      ? { label: "提名最多三家公司", href: "/nominate" }
      : phase === "vote"
        ? { label: "立即投票", href: "/vote" }
        : null;

  // Zeros are never shown: with no participation the line is simply absent.
  const showStat = stats.people > 0 && stats.companies > 0;

  return (
    <>
      <SiteChrome stats={stats} home>
        <div className="hero">
          <div className="hero__ghost" aria-hidden="true">
            TAIWAN → JAPAN
          </div>
          <div className="wrap">
            <div>
              <span className="chip">
                Taiwan → Japan AI Representation Benchmark 2026
              </span>
              <h1>
                哪些台灣新創，
                <br />
                最值得作為
                <br />
                <span className="hl">日本市場</span>發展案例？
              </h1>
              <p className="stand">
                由台灣新創社群共同提名與投票，選出 Community Top 10。前三高票公司將獲得 IQ
                Lite Japan Edition，進一步檢視它們在日本 AI 決策環境中如何被看見、理解與推薦。
              </p>
              <div className="hero__cta">
                {heroCta ? (
                  <Link className="btn btn--red" href={heroCta.href}>
                    {heroCta.label}
                    <Icon icon={ArrowRight} />
                  </Link>
                ) : null}
                <a className="btn btn--line" href="#background">
                  先看前情提要
                </a>
              </div>
              <p className="hero__disc">
                <Icon icon={Info} />
                <span>{DISCLAIMER}</span>
              </p>
            </div>
            <div className="vert" aria-hidden="true">
              <span>台灣新創</span>
              <span>前進日本</span>
            </div>
          </div>
        </div>

        <div className="wrap">
          <Schedule stats={stats} />

          <Band id="background" chip="Background" title="前情提要：為什麼做這份調查">
            <p className="lead">
              這幾年，越來越多台灣新創把<b>日本</b>
              當作走向國際的重要一站。我們一直在關注台灣新創如何在國際市場站穩腳步，而日本，正是累積了許多值得討論案例的市場。
            </p>
            <div className="grid g3">
              {BACKGROUND.map((c, i) => (
                <article className="card" key={c.h}>
                  <div className="no">
                    <span>— NO. {pad2(i + 1)}</span>
                    <Icon icon={c.icon} lg />
                  </div>
                  <h3>{c.h}</h3>
                  <p>{c.p}</p>
                </article>
              ))}
            </div>
            <div className="statement">
              <p>
                所以我們發起這份調查，邀請熟悉台灣新創的你，一起提名最值得作為日本市場發展案例的公司。
              </p>
              <a className="btn btn--brand" href="#nominate">
                我要提名
                <Icon icon={ArrowRight} />
              </a>
            </div>
          </Band>

          <Band
            id="why"
            chip="Why It Matters"
            title="在台灣被看見，不代表在日本的 AI 世界也被看見"
          >
            <p className="lead">
              越來越多日本企業與使用者透過 AI 尋找供應商、比較方案、做出第一輪判斷。一家台灣新創在日本市場的存在感，正在由
              AI 的答案決定。這個 Benchmark 要回答的，是市場看不到的三個問題。
            </p>
            <div className="grid g3">
              {QUESTIONS.map((q, i) => (
                <article className="card card--q" key={q.text}>
                  <div className="no">
                    <span>— Q. {pad2(i + 1)}</span>
                    <Icon icon={q.icon} lg />
                  </div>
                  <h3>{q.text}</h3>
                </article>
              ))}
            </div>
            <p className="note">
              Taiwan → Japan AI Representation Benchmark 將以社群提名建立案例池，再用 ximu
              與 Human Analyst Review 分析市場看不到的 AI Representation。
            </p>
          </Band>

          <Band id="how" chip="How It Works" title="活動方式">
            <HowItWorks phase={phase} />
            <p className="note">
              <a href="#rules">查看完整活動規則 →</a>
            </p>
          </Band>

          <NominatePanel stats={stats} />

          {phase === "nominate" && sorted.length > 0 ? (
            <Band id="recent" chip="Community" title="社群最近提名">
              {showStat ? (
                <p className="statline">
                  {stats.people} 位社群成員參與 · {stats.companies} 家公司被提名
                </p>
              ) : null}
              <Letters posts={sorted.slice(0, RECENT_ON_HOME)} identity={identity} />
              <p className="note">
                <Link href="/nominate#recent">查看全部提名 →</Link>
              </p>
              <p className="note">
                提名經主辦團隊清理與資格檢查後，才會成為第二階段的正式選項。第一階段不公開即時排名或逐名票數。
              </p>
            </Band>
          ) : null}

          {phase === "results" ? <Results finalists={finalists} /> : null}

          <Band
            id="prize"
            chip="Featured Companies"
            title="Top 3 Featured Companies 將獲得什麼"
          >
            <p className="lead">
              前三高票公司各獲得一份 IQ Lite Japan Edition，由 ximu Intelligence 加 Human
              Analyst Review 完成並公開。
            </p>
            <div className="listcard">
              <ul className="lst">
                {PRIZES.map((g, i) => (
                  <li
                    key={g.text}
                    style={i === PRIZES.length - 1 ? { borderBottom: 0 } : undefined}
                  >
                    <Icon icon={g.icon} />
                    {g.text}
                  </li>
                ))}
              </ul>
            </div>
            <div className="price">
              <span className="tag">IQ LITE 定價 US$180</span>
              <span className="note" style={{ margin: 0 }}>
                報告將在取得必要授權後公開提供下載。
              </span>
            </div>

            <h3 className="subhead" id="iqlite">
              一份 IQ Lite 回答三個完整問題
            </h3>
            <div className="grid g3">
              {PILLARS.map((pl) => (
                <article className="card" key={pl.h}>
                  <div className="no">
                    <span className="big">{pl.h}</span>
                    <Icon icon={pl.icon} lg />
                  </div>
                  <h3>{pl.p}</h3>
                </article>
              ))}
            </div>
            <p className="note">
              IQ Lite 提供一次性的市場 Snapshot。ximu 用於持續觀察市場、Query、競爭狀態與 AI
              Representation 的變化。
            </p>
          </Band>

          <Band id="rules" chip="Rules & Method" title="規則與方法" bodyClass="two">
            <div className="method">
              <span className="chip">編輯部說明</span>
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
                  提名 {dateRange(stats.nominate_open, stats.nominate_close)}；投票{" "}
                  {dateRange(stats.vote_open, stats.vote_close)}；結果{" "}
                  {stats.results_label}公布。
                </div>
              </details>
              <details>
                <summary>資料用途</summary>
                <div className="a">
                  Email 僅用於去重與結果通知，不公開、不作行銷使用。
                </div>
              </details>
              <details>
                <summary>異常票處理</summary>
                <div className="a">
                  Email 去重、後台清理；主辦團隊保留移除異常票的權利。
                </div>
              </details>
              <details>
                <summary>同票處理</summary>
                <div className="a">同票者並列，以提名階段附議數作為次序參考。</div>
              </details>
              <details>
                <summary>結果公告方式</summary>
                <div className="a">於本頁公布，並以 Email 通知參與者。</div>
              </details>
            </div>
          </Band>

          <section id="convert">
            <div className="band">
              <span className="chip">Your Market</span>
              <h2>從 Benchmark 到你自己的市場位置</h2>
            </div>
            <div className="body grid g2">
              <div className="conv">
                <Icon icon={Compass} lg />
                <h3>想看見自己的市場位置？</h3>
                <p>取得一份針對單一市場與商業問題的標準化 AI Representation 診斷。</p>
                <a
                  className="btn btn--brand"
                  href={stats.iqlite_url || DEFAULT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get Your IQ Lite — US$180
                </a>
              </div>
              <div className="conv">
                <Icon icon={Activity} lg />
                <h3>想持續掌握市場如何改變？</h3>
                <p>
                  IQ Lite 提供一次性的市場 Snapshot；ximu 用於持續觀察市場、Query、競爭狀態與
                  AI Representation 的變化。
                </p>
                <a
                  className="btn btn--ghost"
                  href={stats.ximu_url || DEFAULT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Start with ximu
                </a>
              </div>
            </div>
          </section>

          <Band id="faq" chip="FAQ" title="常見問題">
            <div className="acc">
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
                  一份公開的 IQ Lite Japan Edition，回答三件事：AI
                  如何理解與描述這家公司、公司與主要競爭者在 AI
                  答案中有何不同、目前最值得優先處理的行動。報告將在取得必要授權後公開提供下載。
                </div>
              </details>
            </div>
          </Band>

          <div className="partners" id="partners">
            <span className="chip">Ecosystem and Media Partners</span>
            <div>{stats.partners_text}</div>
          </div>
        </div>
      </SiteChrome>

      {identity.modal}
    </>
  );
}

/* ------------------------------------------------------------ schedule */

function Schedule({ stats }: { stats: Stats }) {
  const rows: { k: string; v: string; now: boolean; icon: LucideIcon }[] = [
    {
      icon: PenLine,
      k: "提名期間",
      v: dateRange(stats.nominate_open, stats.nominate_close),
      now: stats.phase === "nominate",
    },
    {
      icon: SquareCheckBig,
      k: "投票期間",
      v: dateRange(stats.vote_open, stats.vote_close),
      now: stats.phase === "vote",
    },
    {
      icon: Megaphone,
      k: "結果公布",
      v: stats.results_label,
      now: stats.phase === "results" || stats.phase === "closed",
    },
  ];
  return (
    <div className="sched" aria-label="時程">
      {rows.map((r) => (
        <div className={r.now ? "sc now" : "sc"} key={r.k}>
          <Icon icon={r.icon} />
          <span className="k">{r.k}</span>
          <span className="v">{r.v}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------- how it works */

function HowItWorks({ phase }: { phase: Phase }) {
  const steps = [
    {
      icon: PenLine,
      h: "社群公開提名",
      p: "每人最多提名三家台灣新創。",
      now: phase === "nominate",
    },
    {
      icon: ListFilter,
      h: "形成 Shortlist",
      p: "主辦團隊清理公司名稱、檢查資格並形成 Top 10–12 候選名單。",
      now: false,
    },
    {
      icon: SquareCheckBig,
      h: "社群正式投票",
      p: "每個 Email 最多投三家公司，產生 Community Top 10 與 Top 3。",
      now: phase === "vote",
    },
    {
      icon: FileText,
      h: "ximu 分析與公開發布",
      p: "前三高票公司獲得 IQ Lite Japan Edition，報告與 Benchmark 將公開提供下載。",
      now: phase === "results",
    },
  ];
  return (
    <div className="grid g4">
      {steps.map((s, i) => (
        <article className="card" key={s.h}>
          <div className="no">
            <span>— STEP {pad2(i + 1)}</span>
            <Icon icon={s.icon} lg />
          </div>
          <h3>
            {s.h}
            {s.now ? <span className="live">進行中</span> : null}
          </h3>
          <p>{s.p}</p>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------ nominate / vote panel */

/**
 * The prototype's nominate panel, by phase. The form itself lives on
 * `/nominate` and `/vote`; here the right side carries the current period and
 * the phase CTA. pre / closed / results show their notice text in the panel.
 */
function NominatePanel({ stats }: { stats: Stats }) {
  const cta = headerCta(stats.phase);
  const nominatePeriod = dateRange(stats.nominate_open, stats.nominate_close);
  const votePeriod = dateRange(stats.vote_open, stats.vote_close);

  const view: {
    chip: string;
    title: string;
    main: ReactNode;
    k: string;
    v: string;
    btn: { label: string; href: string };
  } =
    stats.phase === "vote"
      ? {
          chip: "Vote",
          title: "從 Community Shortlist 選出最多三家公司",
          main: (
            <>
              <h3>每個 Email 最多投三家公司</h3>
              <p>
                以下名單由第一階段提名整理而成，公司名稱已統一、資格已確認。每個 Email
                最多投三家。
              </p>
              <ul className="checks">
                <li>
                  <Icon icon={SquareCheckBig} />
                  從 Community Shortlist 選出最多三家
                </li>
                <li>
                  <Icon icon={Info} />
                  投票期間不公開票數、排名或目前領先狀態。
                </li>
              </ul>
            </>
          ),
          k: "投票期間",
          v: votePeriod,
          btn: cta,
        }
      : stats.phase === "nominate"
        ? {
            chip: "Nominate",
            title: "提名你認為最值得觀察的台灣赴日新創",
            main: (
              <>
                <h3>每人最多提名三家公司</h3>
                <p>請提供公司中英文名稱、官方網址，以及你認為它值得被觀察的理由。</p>
                <ul className="checks">
                  <li>
                    <Icon icon={MapPin} />
                    公司中英文名稱
                  </li>
                  <li>
                    <Icon icon={LinkIcon} />
                    官方網址
                  </li>
                  <li>
                    <Icon icon={MessageSquareText} />
                    10–50 字的提名理由
                  </li>
                </ul>
              </>
            ),
            k: "提名期間",
            v: nominatePeriod,
            btn: cta,
          }
        : stats.phase === "pre"
          ? {
              chip: "Nominate",
              title: "提名你認為最值得觀察的台灣赴日新創",
              main: (
                <>
                  <h3>提名尚未開放</h3>
                  <p className="empty">提名將於 {monthDay(stats.nominate_open)} 開放。</p>
                </>
              ),
              k: "提名期間",
              v: nominatePeriod,
              btn: cta,
            }
          : stats.phase === "closed"
            ? {
                chip: "Vote",
                title: "投票已結束",
                main: (
                  <>
                    <h3>投票已結束</h3>
                    <p className="empty">
                      投票已結束。結果預計於 {stats.results_label} 公布。
                    </p>
                  </>
                ),
                k: "結果公布",
                v: stats.results_label,
                btn: cta,
              }
            : {
                chip: "Results",
                title: "結果公布",
                main: (
                  <>
                    <h3>Community Top 10 與 3 Most Voted Featured Companies</h3>
                    <p className="empty">
                      本結果由社群提名與投票產生，代表市場認知與關注，不等於日本發展成效的客觀前三名。
                    </p>
                  </>
                ),
                k: "結果公布",
                v: stats.results_label,
                btn: { label: "查看結果", href: "#results" },
              };

  return (
    <Band id="nominate" chip={view.chip} title={view.title}>
      <div className="panel">
        <div className="panel__main">{view.main}</div>
        <div className="panel__side">
          <span className="k">{view.k}</span>
          <span className="v">
            <Period text={view.v} />
          </span>
          <Link className="btn btn--red" href={view.btn.href} style={{ alignSelf: "flex-start" }}>
            {view.btn.label}
            <Icon icon={ArrowRight} />
          </Link>
          <small>Email 僅用於去重，不公開、不作行銷使用。</small>
        </div>
      </div>
    </Band>
  );
}

/* ------------------------------------------------------------- results */

function Results({ finalists }: { finalists: PublicFinalist[] }) {
  const ranked = finalists
    .slice()
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.sort - b.sort);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3, 10);

  return (
    <Band
      id="results"
      chip="Results"
      title="Community Top 10 與 3 Most Voted Featured Companies"
    >
      <p className="lead">
        本結果由社群提名與投票產生，代表市場認知與關注，不等於日本發展成效的客觀前三名。
      </p>
      {top.length === 0 ? (
        <p className="empty">結果尚未公布。</p>
      ) : (
        <div className="grid g3">
          {top.map((f, i) => (
            <article className="card" key={f.id}>
              <div className="no">
                <span className="rank">{pad2(i + 1)}</span>
                <Icon icon={Megaphone} lg />
              </div>
              <h3>{f.company}</h3>
              {f.name_en ? <span className="en">{f.name_en}</span> : null}
              {f.one_liner ? <p>{f.one_liner}</p> : null}
              {f.top_reason ? <blockquote>「{f.top_reason}」</blockquote> : null}
              <div className="cardfoot">
                <span className="votes">{f.votes ?? 0} 票</span>
                {f.report_url ? (
                  <a href={f.report_url} target="_blank" rel="noopener noreferrer">
                    閱讀報告
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      {rest.length > 0 ? (
        <div className="listcard toplist">
          {rest.map((f, i) => (
            <div className="r" key={f.id}>
              <span className="n">{pad2(i + 4)}</span>
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
    </Band>
  );
}
