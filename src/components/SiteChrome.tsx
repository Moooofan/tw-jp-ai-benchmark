import Link from "next/link";
import type { ReactNode } from "react";
import { monthDay } from "@/lib/format";
import { isPhaseOne, isVotePhase } from "@/lib/phase";
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
  if (phase === "vote") return { label: "立即投票", href: "/vote" };
  if (phase === "closed") return { label: "直播預告", href: "/#live" };
  return { label: "查看活動方式", href: "/#how" };
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
  return (
    <Link className={className} href="/nominate">
      立即提名
      {children}
    </Link>
  );
}

/**
 * Sticky header + brand footer, identical on every public page. Anchors are
 * absolute (`/#how`) so they also work from `/nominate` and `/vote`. Children
 * decide their own width: the hero is full-bleed, sections sit in `.wrap`.
 */
export default function SiteChrome({
  stats,
  home = false,
  story,
  children,
}: {
  story?: ChromeStory;
  stats: Stats;
  /** Marks 首頁 as the current page. */
  home?: boolean;
  children: ReactNode;
}) {
  const cta = headerCta(stats.phase);
  const phaseOne = isPhaseOne(stats.phase);
  const votePhase = isVotePhase(stats.phase);
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link className="brand" href="/">
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
              href="/"
              aria-current={home ? "page" : undefined}
            >
              首頁
            </Link>
            <Link href="/#background">前情提要</Link>
            {phaseOne ? (
              <>
                <Link href="/#faq">常見問題</Link>
              </>
            ) : votePhase ? (
              <>
                <Link href="/#leaderboard">排行榜</Link>
                <Link href="/#reasons">熱門理由</Link>
                <Link href="/#rules">投票規則</Link>
              </>
            ) : (
              <>
                <Link href="/#how">活動方式</Link>
                <Link href="/#rules">規則與方法</Link>
                <Link href="/#faq">FAQ</Link>
              </>
            )}
            <Link className="btn btn--red btn--sm" href={cta.href}>
              {cta.label}
            </Link>
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
                <Link href="/#rules">規則與方法</Link>
                <Link href="/#faq">FAQ</Link>
              </>
            )}
            <span>{story ? story.copyright : "© 2026"}</span>
          </nav>
        </div>
      </footer>
    </>
  );
}
