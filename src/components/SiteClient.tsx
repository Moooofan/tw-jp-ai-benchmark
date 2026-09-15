"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileText,
  Info,
  Link as LinkIcon,
  ListFilter,
  MapPin,
  Megaphone,
  MessageSquareText,
  PenLine,
  SquareCheckBig,
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
import BackgroundBand from "./BackgroundBand";
import Icon from "./Icon";
import { useParticipantEmail } from "./ParticipantEmail";
import Letters from "./Letters";
import SiteChrome, {
  DISCLAIMER,
  headerCta,
  type ChromeStory,
} from "./SiteChrome";

const REFRESH_MS = 20_000;
const RECENT_ON_HOME = 6;
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

/**
 * Results-phase story content (spec v6 §1). Rendered by the server module
 * `story.tsx` and handed in as slots, so none of that copy is part of this
 * client bundle; outside results the slots are simply absent.
 */
export type StorySlots = {
  chip: string;
  standMore: string;
  why: ReactNode;
  prize: ReactNode;
  convert: ReactNode;
  faqPrize: ReactNode;
  partners: ReactNode;
  step4: { h: string; p: string };
  chrome: ChromeStory;
};

export default function SiteClient({
  stats,
  posts: serverPosts,
  finalists,
  slots,
}: {
  slots?: StorySlots;
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
      <SiteChrome stats={stats} home story={slots?.chrome}>
        <div className="hero">
          <div className="hero__ghost" aria-hidden="true">
            TAIWAN → JAPAN
          </div>
          <div className="wrap">
            <div>
              <span className="chip">
                {slots?.chip ?? "TAIWAN → JAPAN 2026"}
              </span>
              <h1>
                哪些台灣新創，
                <br />
                最值得作為
                <br />
                <span className="hl">日本市場</span>發展案例？
              </h1>
              <p className="stand">
                由台灣新創社群共同提名與投票，選出 Community Top 10。
                {slots?.standMore}
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

          <BackgroundBand ctaHref="#nominate" />

          {slots?.why}

          <Band id="how" chip="How It Works" title="活動方式">
            <HowItWorks phase={phase} step4={slots?.step4} />
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
              <Letters
                posts={sorted.slice(0, RECENT_ON_HOME)}
                identity={identity}
              />
              <p className="note">
                <Link href="/nominate#recent">查看全部提名 →</Link>
              </p>
              <p className="note">
                提名經主辦團隊清理與資格檢查後，才會成為第二階段的正式選項。第一階段不公開即時排名或逐名票數。
              </p>
            </Band>
          ) : null}

          {phase === "results" ? <Results finalists={finalists} /> : null}

          {slots?.prize}

          <Band
            id="rules"
            chip="Rules & Method"
            title="規則與方法"
            bodyClass="two"
          >
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
                  提名 {dateRange(stats.nominate_open, stats.nominate_close)}
                  ；投票 {dateRange(
                    stats.vote_open,
                    stats.vote_close,
                  )}；結果 {stats.results_label}公布。
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
                <div className="a">
                  同票者並列，以提名階段附議數作為次序參考。
                </div>
              </details>
              <details>
                <summary>結果公告方式</summary>
                <div className="a">於本頁公布，並以 Email 通知參與者。</div>
              </details>
            </div>
          </Band>

          {slots?.convert}

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
              {slots?.faqPrize}
            </div>
          </Band>

          {slots?.partners}
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

function HowItWorks({
  phase,
  step4,
}: {
  phase: Phase;
  step4?: { h: string; p: string };
}) {
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
    ...(step4
      ? [{ icon: FileText, h: step4.h, p: step4.p, now: phase === "results" }]
      : []),
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
                以下名單由第一階段提名整理而成，公司名稱已統一、資格已確認。每個
                Email 最多投三家。
              </p>
              <ul className="checks">
                <li>
                  <Icon icon={SquareCheckBig} />從 Community Shortlist
                  選出最多三家
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
                <p>
                  請提供公司中英文名稱、官方網址，以及你認為它值得被觀察的理由。
                </p>
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
                  <p className="empty">
                    提名將於 {monthDay(stats.nominate_open)} 開放。
                  </p>
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
          <Link
            className="btn btn--red"
            href={view.btn.href}
            style={{ alignSelf: "flex-start" }}
          >
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
              {f.top_reason ? (
                <blockquote>「{f.top_reason}」</blockquote>
              ) : null}
              <div className="cardfoot">
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
