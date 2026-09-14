"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChartLine,
  Compass,
  Eye,
  FileText,
  Link as LinkIcon,
  ListChecks,
  ListFilter,
  Megaphone,
  MessageSquareQuote,
  Microscope,
  Newspaper,
  PenLine,
  Radar,
  Scale,
  Search,
  SquareCheckBig,
  Target,
  type LucideIcon,
} from "lucide-react";
import { dateRange, monthDay } from "@/lib/format";
import {
  type Phase,
  type PublicFinalist,
  type PublicPost,
  type Stats,
} from "@/lib/types";
import Icon from "./Icon";
import { useParticipantEmail } from "./ParticipantEmail";
import Letters from "./Letters";
import Section from "./SectionGrid";
import SiteChrome, { DISCLAIMER } from "./SiteChrome";

const REFRESH_MS = 20_000;
const RECENT_ON_HOME = 6;
const DEFAULT_LINK = "https://ximu.ai/";

/* Icon ↔ text pairs (spec v4 §B). The text is verbatim copy. */
const QUESTIONS: { icon: LucideIcon; text: string }[] = [
  {
    icon: Search,
    text: "當日本使用者詢問相關產品或服務時，AI 是否會提到這家公司？",
  },
  { icon: MessageSquareQuote, text: "AI 如何描述它的定位、能力與競爭者？" },
  { icon: LinkIcon, text: "AI 的答案引用哪些來源，又缺少哪些可信資訊？" },
];

const PRIZES: { icon: LucideIcon; text: string }[] = [
  { icon: FileText, text: "IQ Lite Japan Edition 報告一份" },
  { icon: Microscope, text: "ximu Intelligence 分析與 Human Analyst Review" },
  { icon: Radar, text: "日本市場的 AI Representation 診斷" },
  { icon: LinkIcon, text: "來源與引用環境檢視" },
  { icon: Scale, text: "競爭定位比較" },
  { icon: ListChecks, text: "目前最值得處理的優先行動" },
  { icon: Newspaper, text: "公開案例曝光" },
];

const PILLARS: { icon: LucideIcon; h: string; p: string }[] = [
  { icon: Eye, h: "See", p: "AI 如何理解與描述這家公司？" },
  { icon: Scale, h: "Compare", p: "公司與主要競爭者在 AI 答案中有何不同？" },
  { icon: Target, h: "Decide", p: "目前最值得優先處理的三項行動是什麼？" },
];

/** Running section numbers (01, 02, …) so a hidden phase leaves no gap. */
function makeCounter() {
  let n = 0;
  return () => String(++n).padStart(2, "0");
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
  const num = makeCounter();

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
      <SiteChrome stats={stats}>
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
              {heroCta ? (
                <Link className="cta cta--passion" href={heroCta.href}>
                  {heroCta.label}
                </Link>
              ) : null}
              <Link className="cta" href="/#how">
                查看活動方式
              </Link>
            </div>
            <p className="disc">
              <b>方法與限制</b>
              {DISCLAIMER}
            </p>
          </div>
          <div>
            <Schedule stats={stats} />
            {showStat ? (
              <p className="hero__stat">
                {stats.people} 位社群成員參與 · {stats.companies} 家公司被提名
              </p>
            ) : null}
          </div>
        </section>

        {phase === "results" ? (
          <Results num={num()} finalists={finalists} />
        ) : null}

        <Section
          id="why"
          num={num()}
          title="在台灣被看見，不代表在日本的 AI 世界也被看見"
        >
          <p className="lede">
            越來越多日本企業與使用者透過 AI 尋找供應商、比較方案、做出第一輪判斷。一家台灣新創在日本市場的存在感，正在由 AI 的答案決定。這個 Benchmark 要回答的，是市場看不到的三個問題。
          </p>
          <ol className="qs">
            {QUESTIONS.map((q) => (
              <li key={q.text}>
                <span className="irow">
                  <Icon icon={q.icon} />
                  <span>{q.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="close">
            Taiwan → Japan AI Representation Benchmark
            將以社群提名建立案例池，再用 ximu 與 Human Analyst Review 分析市場看不到的
            AI Representation。
          </p>
        </Section>

        <Section id="how" num={num()} title="活動方式">
          <HowItWorks phase={phase} />
          <p className="note">
            <Link href="/#rules">查看完整活動規則 →</Link>
          </p>
        </Section>

        <CallToAction num={num()} stats={stats} />

        {phase === "nominate" && sorted.length > 0 ? (
          <Section id="recent" num={num()} title="社群最近提名">
            <Letters
              posts={sorted.slice(0, RECENT_ON_HOME)}
              identity={identity}
            />
            <p className="note">
              <Link className="tbtn" href="/nominate#recent">
                查看全部提名 →
              </Link>
            </p>
            <p className="note">
              提名經主辦團隊清理與資格檢查後，才會成為第二階段的正式選項。第一階段不公開即時排名或逐名票數。
            </p>
          </Section>
        ) : null}

        <Section id="prize" num={num()} title="Top 3 Featured Companies 將獲得什麼">
          <p className="lede">
            前三高票公司各獲得一份 IQ Lite Japan Edition，由 ximu Intelligence 加
            Human Analyst Review 完成並公開。
          </p>
          <ul className="gets">
            {PRIZES.map((g) => (
              <li className="irow" key={g.text}>
                <Icon icon={g.icon} />
                <span>{g.text}</span>
              </li>
            ))}
          </ul>
          <span className="valuetag">IQ Lite 定價 US$180</span>
          <p className="note">報告將在取得必要授權後公開提供下載。</p>
        </Section>

        <Section id="iqlite" num={num()} title="一份 IQ Lite 回答三個完整問題">
          <div className="pillars">
            {PILLARS.map((pl) => (
              <div className="pillar irow" key={pl.h}>
                <Icon icon={pl.icon} />
                <div className="pillar__kv">
                  <h3>{pl.h}</h3>
                  <p>{pl.p}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="note">
            IQ Lite 提供一次性的市場 Snapshot。ximu 用於持續觀察市場、Query、競爭狀態與
            AI Representation 的變化。
          </p>
        </Section>

        <Section id="rules" num={num()} title="規則與方法">
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
                Email 僅用於去重與結果通知，不公開、不作行銷使用。
              </div>
            </details>
            <details>
              <summary>異常票處理</summary>
              <div className="a">
                Email 去重、後台清理，主辦團隊保留移除異常票的權利。
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
        </Section>

        <Section id="faq" num={num()} title="FAQ">
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
                一份 IQ Lite Japan Edition，回答三件事：AI
                如何理解與描述這家公司、公司與主要競爭者在 AI
                答案中有何不同、目前最值得優先處理的行動。報告將在取得必要授權後公開提供下載。
              </div>
            </details>
          </div>
        </Section>

        <Section id="convert" num={num()} title="從 Benchmark 到你自己的市場位置">
          <div className="convert">
            <div className="irow">
              <Icon icon={Compass} />
              <div>
                <h3>想看見自己的市場位置？</h3>
                <p>取得一份針對單一市場與商業問題的標準化 AI Representation 診斷。</p>
                <a
                  className="tbtn"
                  href={stats.iqlite_url || DEFAULT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get Your IQ Lite — US$180
                </a>
              </div>
            </div>
            <div className="irow">
              <Icon icon={ChartLine} />
              <div>
                <h3>想持續掌握市場如何改變？</h3>
                <p>
                  IQ Lite 提供一次性的市場 Snapshot；ximu
                  用於持續觀察市場、Query、競爭狀態與 AI Representation 的變化。
                </p>
                <a
                  className="tbtn"
                  href={stats.ximu_url || DEFAULT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Start with ximu
                </a>
              </div>
            </div>
          </div>
        </Section>

        <div className="partners" id="partners">
          <span className="eyebrow">Ecosystem and Media Partners</span>
          <p>{stats.partners_text}</p>
        </div>
      </SiteChrome>

      {identity.modal}
    </>
  );
}

/* ------------------------------------------------------------ schedule */

function Schedule({ stats }: { stats: Stats }) {
  const rows: {
    k: string;
    v: string;
    s: string;
    now: boolean;
    icon: LucideIcon;
  }[] = [
    {
      icon: PenLine,
      k: "提名期間",
      v: dateRange(stats.nominate_open, stats.nominate_close),
      s: "每人最多提名三家公司",
      now: stats.phase === "nominate",
    },
    {
      icon: SquareCheckBig,
      k: "投票期間",
      v: dateRange(stats.vote_open, stats.vote_close),
      s: "從 Community Shortlist 選出最多三家",
      now: stats.phase === "vote",
    },
    {
      icon: Megaphone,
      k: "結果公布",
      v: stats.results_label,
      s: "Community Top 10 與 3 Most Voted Featured Companies",
      now: stats.phase === "results" || stats.phase === "closed",
    },
  ];
  return (
    <aside className="sched" aria-label="時程">
      {rows.map((r) => (
        <div className={r.now ? "row irow now" : "row irow"} key={r.k}>
          <Icon icon={r.icon} />
          <div>
            <span className="k">{r.k}</span>
            <span className="v">
              {r.v}
              <small>{r.s}</small>
            </span>
          </div>
        </div>
      ))}
    </aside>
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
    <div className="steps">
      {steps.map((s, i) => (
        <div className={s.now ? "step now" : "step"} key={s.h}>
          <Icon icon={s.icon} size={24} />
          <div className="num">{i + 1}</div>
          <h3>{s.h}</h3>
          <p>{s.p}</p>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------- section 03: the CTA block */

/**
 * The form itself lives on `/nominate` and `/vote`; on the editorial page this
 * section is only an invitation.
 */
function CallToAction({ num, stats }: { num: string; stats: Stats }) {
  if (stats.phase === "nominate") {
    return (
      <Section id="nominate" num={num} title="提名">
        <div className="ctablock">
          <h3>提名你認為最值得觀察的台灣赴日新創</h3>
          <p>
            每人最多提名三家公司。請提供公司中英文名稱、官方網址，以及你認為它值得被觀察的理由。
          </p>
          <span className="period">
            提名期間 {dateRange(stats.nominate_open, stats.nominate_close)}
          </span>
          <Link className="cta cta--fill" href="/nominate">
            開始提名
          </Link>
        </div>
      </Section>
    );
  }
  if (stats.phase === "vote") {
    return (
      <Section id="nominate" num={num} title="投票">
        <div className="ctablock">
          <h3>從 Community Shortlist 選出最多三家公司</h3>
          <p>
            以下名單由第一階段提名整理而成，公司名稱已統一、資格已確認。每個 Email
            最多投三家。
          </p>
          <span className="period">
            投票期間 {dateRange(stats.vote_open, stats.vote_close)}
          </span>
          <Link className="cta cta--fill" href="/vote">
            立即投票
          </Link>
        </div>
      </Section>
    );
  }
  if (stats.phase === "pre") {
    return (
      <Section id="nominate" num={num} title="提名尚未開放">
        <p className="empty">提名將於 {monthDay(stats.nominate_open)} 開放。</p>
      </Section>
    );
  }
  if (stats.phase === "closed") {
    return (
      <Section id="nominate" num={num} title="投票已結束">
        <p className="empty">
          投票已結束。結果預計於 {stats.results_label} 公布。
        </p>
      </Section>
    );
  }
  return null;
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
    <Section
      id="results"
      num={num}
      title="Community Top 10 與 3 Most Voted Featured Companies"
    >
      <p className="lede">
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
                  <a href={f.report_url} target="_blank" rel="noopener noreferrer">
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
    </Section>
  );
}
