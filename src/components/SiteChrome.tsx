import Link from "next/link";
import type { ReactNode } from "react";
import type { Phase, Stats } from "@/lib/types";

export const DISCLAIMER =
  "本活動反映社群關注與市場認知，不構成企業赴日業績的客觀排名。";
export const WORDMARK = "AI Representation Benchmark";

/** Header CTA by phase (spec v5). */
export function headerCta(phase: Phase): { label: string; href: string } {
  if (phase === "nominate") return { label: "開始提名", href: "/nominate" };
  if (phase === "vote") return { label: "立即投票", href: "/vote" };
  return { label: "查看活動方式", href: "/#how" };
}

/**
 * Sticky header + brand footer, identical on every public page. Anchors are
 * absolute (`/#how`) so they also work from `/nominate` and `/vote`. Children
 * decide their own width: the hero is full-bleed, sections sit in `.wrap`.
 */
export default function SiteChrome({
  stats,
  home = false,
  children,
}: {
  stats: Stats;
  /** Marks 首頁 as the current page. */
  home?: boolean;
  children: ReactNode;
}) {
  const cta = headerCta(stats.phase);
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
            <span className="word">
              {WORDMARK}
              <small>Taiwan → Japan · 2026</small>
            </span>
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
            <Link href="/#how">活動方式</Link>
            <Link href="/#rules">規則與方法</Link>
            <Link href="/#faq">FAQ</Link>
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
            <p>{DISCLAIMER}</p>
            {stats.contact_email ? (
              <p>
                聯絡：
                <a href={`mailto:${stats.contact_email}`}>{stats.contact_email}</a>
              </p>
            ) : null}
          </div>
          <nav>
            <Link href="/#rules">規則與方法</Link>
            <Link href="/#faq">FAQ</Link>
            <span>© 2026 ximu</span>
          </nav>
        </div>
      </footer>
    </>
  );
}
