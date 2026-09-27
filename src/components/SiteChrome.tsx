import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { monthDay } from "@/lib/format";
import { isPhaseOne, isVotePhase, PHASE_TWO_PATH } from "@/lib/phase";
import type { Phase, Stats } from "@/lib/types";

export const DISCLAIMER =
  "本活動反映社群關注與市場認知，不構成企業赴日業績的客觀排名。";
/**
 * Results-phase wordmark and copyright (spec v5), supplied by the server-only
 * `story.tsx`. Absent -> the neutral Phase 1 identity (spec v6 §2). Kept out of
 * this module so the later story never ships in the Phase 1 bundle.
 */
export type ChromeStory = {
  wordmark: string;
  small: string;
  copyright: string;
};

/** Header CTA by phase (spec v5; Phase 1 per spec v6 §3). */
export function headerCta(phase: Phase): { label: string; href: string } {
  if (phase === "nominate") return { label: "立即提名", href: "/nominate" };
  if (phase === "pre") return { label: "常見問題", href: "/#faq" };
  if (phase === "vote") return { label: "開始投票", href: "/vote" };
  if (phase === "closed")
    return { label: "目前結果", href: `${PHASE_TWO_PATH}#results` };
  return { label: "查看活動方式", href: `${PHASE_TWO_PATH}#how` };
}

/** Campaign names (memo v3.0 §Hero 與品牌層級). */
export const CAMPAIGN_ZH = "台灣新創赴日形象資產決策標竿計畫";
export const CAMPAIGN_EN = "Taiwan → Japan AI Representation Benchmark";
export const STRATEGY_LINE =
  "IMAGE Asset Governance × Humans + AI × Directed Growth";
/**
 * Co-brand slogans. The memo lists 「VM | VOCAL MIDDLE 與 ximu 的名稱、Logo、
 * Seen and Trusted by Humans & AI、See What AI See」 in that order, so each
 * slogan sits with the brand in the same position.
 */
export const VM_SLOGAN = "Seen and Trusted by Humans & AI";
export const XIMU_SLOGAN = "See What AI See";

/** VM | VOCAL MIDDLE × ximu logos. */
export function CoBrand({
  ximuUrl,
  size = "md",
}: {
  ximuUrl?: string;
  size?: "md" | "lg";
}) {
  const h = size === "lg" ? 34 : 26;
  const ximu = (
    <Image
      src="/brand/ximu.svg"
      alt="ximu"
      width={Math.round(h * 0.95 * 2.771)}
      height={Math.round(h * 0.95)}
      unoptimized
    />
  );
  return (
    <span className={`cobrand cobrand--${size}`}>
      <span className="cobrand__one">
        <Image
          src="/brand/vocal-middle.png"
          alt="VM | VOCAL MIDDLE 布爾喬亞公關顧問"
          width={Math.round(h * 4.733)}
          height={h}
          unoptimized
        />
      </span>
      <span className="cobrand__x" aria-hidden="true">
        ×
      </span>
      <span className="cobrand__one">
        {ximuUrl ? (
          <a href={ximuUrl} target="_blank" rel="noopener">
            {ximu}
          </a>
        ) : (
          ximu
        )}
      </span>
    </span>
  );
}

/** Phase 1 nominate CTA: a red link while open, the opening date before. */
export function NominateCta({
  stats,
  className = "btn btn--red",
  children,
}: {
  stats: Stats;
  className?: string;
  children?: ReactNode;
}) {
  if (stats.phase === "pre") {
    return (
      <span className={`${className} btn--wait`} aria-disabled="true">
        提名將於 {monthDay(stats.nominate_open)} 開放
      </span>
    );
  }
  if (stats.phase !== "nominate") {
    return (
      <span className={`${className} btn--wait`} aria-disabled="true">
        提名已截止
      </span>
    );
  }
  return (
    <Link className={className} href="/nominate">
      立即提名
      {children}
    </Link>
  );
}

/**
 * Sticky header + brand footer. Two tracks (owner, 2026-09-27: Phase One and
 * Phase Two use different URLs):
 * - `one`: `/` and `/nominate` in every phase — the Phase 1 identity; after
 *   nominations close the CTA points to Phase Two (`phaseTwoHref`) once public.
 * - `two`: `/phase-two`, `/vote`, `/candidates…`, `/company/…` — the co-brand
 *   bar (memo v3.0) and anchors inside `/phase-two`.
 * Children decide their own width: the hero is full-bleed, sections sit in `.wrap`.
 */
export default function SiteChrome({
  stats,
  home = false,
  story,
  track,
  phaseTwoHref,
  children,
}: {
  story?: ChromeStory;
  stats: Stats;
  /** Marks 首頁 as the current page. */
  home?: boolean;
  /** Defaults to `one` in pre / nominate and `two` afterwards. */
  track?: "one" | "two";
  /** Track `one` after nominations close: where Phase Two lives, once public. */
  phaseTwoHref?: string;
  children: ReactNode;
}) {
  const t = track ?? (isPhaseOne(stats.phase) ? "one" : "two");
  if (t === "two" && isVotePhase(stats.phase)) {
    return (
      <PhaseTwoChrome stats={stats} home={home}>
        {children}
      </PhaseTwoChrome>
    );
  }
  const phaseOne = t === "one";
  const base = phaseOne ? "/" : PHASE_TWO_PATH;
  const cta = !phaseOne
    ? headerCta(stats.phase)
    : isPhaseOne(stats.phase)
      ? headerCta(stats.phase)
      : phaseTwoHref
        ? { label: "前往 Phase Two", href: phaseTwoHref }
        : null; // between nominate_close and vote_open: nothing to act on
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link className="brand" href={base}>
            <span className="bars" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {story ? (
              <span className="word">
                {story.wordmark}
                <small>{story.small}</small>
              </span>
            ) : (
              <span className="word">
                Taiwan → Japan
                <small>Startup Nomination · 2026</small>
              </span>
            )}
          </Link>
          <nav className="nav">
            <Link
              className={home ? "on" : undefined}
              href={base}
              aria-current={home ? "page" : undefined}
            >
              首頁
            </Link>
            {phaseOne ? (
              <>
                <Link href="/#background">前情提要</Link>
                <Link href="/#board">候選名單</Link>
                <Link href="/#faq">常見問題</Link>
              </>
            ) : (
              <>
                <Link href={`${base}#how`}>活動方式</Link>
                <Link href={`${base}#rules`}>規則與方法</Link>
                <Link href={`${base}#faq`}>FAQ</Link>
              </>
            )}
            {cta ? (
              <Link className="btn btn--red btn--sm" href={cta.href}>
                {cta.label}
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="foot">
        <div className="wrap">
          <div>
            <div className="foot-big">
              TAIWAN <span>→</span> JAPAN 2026
            </div>
            <p className="publisher">發布單位：VM布爾喬亞新創服務事業群</p>
            <p>{DISCLAIMER}</p>
            {stats.contact_email ? (
              <p>
                聯絡：
                <a href={`mailto:${stats.contact_email}`}>
                  {stats.contact_email}
                </a>
              </p>
            ) : null}
          </div>
          <nav>
            {phaseOne ? (
              <>
                <Link href="/#faq">常見問題</Link>
              </>
            ) : (
              <>
                <Link href={`${base}#rules`}>規則與方法</Link>
                <Link href={`${base}#faq`}>FAQ</Link>
              </>
            )}
            <span>{story ? story.copyright : "© 2026"}</span>
          </nav>
        </div>
      </footer>
    </>
  );
}

/**
 * Phase Two chrome (memo v3.0 + reference image): co-brand bar with both
 * logos and slogans, kept smaller than the Campaign headline; every anchor
 * stays inside `/phase-two`.
 */
function PhaseTwoChrome({
  stats,
  home,
  children,
}: {
  stats: Stats;
  home: boolean;
  children: ReactNode;
}) {
  const p2 = PHASE_TWO_PATH;
  const closed = stats.phase === "closed";
  return (
    <>
      <header className="top top--p2">
        <div className="wrap wrap--wide">
          <Link className="p2brand" href={p2} aria-label={`${CAMPAIGN_ZH} Phase Two 首頁`}>
            <CoBrand ximuUrl={undefined} />
          </Link>
          <nav className="nav">
            <Link
              className={home ? "on" : undefined}
              href={p2}
              aria-current={home ? "page" : undefined}
            >
              首頁
            </Link>
            <Link href={`${p2}#results`}>目前結果</Link>
            <Link href="/candidates">遺珠之憾</Link>
            <Link href={`${p2}#how`}>投票規則</Link>
            {closed ? (
              <Link className="btn btn--red btn--sm" href={`${p2}#results`}>
                目前結果
              </Link>
            ) : (
              <Link className="btn btn--red btn--sm" href="/vote">
                開始投票
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="foot foot--p2">
        <div className="wrap wrap--wide">
          <div>
            <p className="foot-kicker">PHASE TWO | COMMUNITY VOTING</p>
            <div className="foot-name">{CAMPAIGN_ZH}</div>
            <div className="foot-en">{CAMPAIGN_EN}</div>
            <div className="foot-brands">
              <span className="foot-brand">
                <b>VM | VOCAL MIDDLE</b>
                <span>{VM_SLOGAN}</span>
              </span>
              <span className="foot-brand">
                {stats.ximu_url ? (
                  <a href={stats.ximu_url} target="_blank" rel="noopener">
                    <b>ximu</b>
                  </a>
                ) : (
                  <b>ximu</b>
                )}
                <span>{XIMU_SLOGAN}</span>
              </span>
            </div>
            <p className="publisher">發布單位：VM布爾喬亞新創服務事業群</p>
            <p>{DISCLAIMER}</p>
            {stats.contact_email ? (
              <p>
                聯絡：
                <a href={`mailto:${stats.contact_email}`}>
                  {stats.contact_email}
                </a>
              </p>
            ) : null}
          </div>
          <nav>
            <Link href={`${p2}#how`}>投票規則</Link>
            <Link href={`${p2}#faq`}>FAQ</Link>
            <Link href="/">Phase One 提名頁</Link>
            <span>© 2026</span>
          </nav>
        </div>
      </footer>
    </>
  );
}
