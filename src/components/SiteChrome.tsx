import Link from "next/link";
import type { ReactNode } from "react";
import type { Phase, Stats } from "@/lib/types";

export const DISCLAIMER =
  "本活動反映社群關注與市場認知，不構成企業赴日業績的客觀排名。";
export const WORDMARK = "AI Representation Benchmark";

/** Header CTA by phase (spec v3 §6). */
export function headerCta(phase: Phase): { label: string; href: string } {
  if (phase === "nominate") return { label: "開始提名", href: "/nominate" };
  if (phase === "vote") return { label: "立即投票", href: "/vote" };
  return { label: "查看活動方式", href: "/#how" };
}

/**
 * Utility row + masthead + colophon, identical on every public page. The
 * anchors are absolute (`/#how`) so they also work from `/nominate` and
 * `/vote`.
 */
export default function SiteChrome({
  stats,
  children,
}: {
  stats: Stats;
  children: ReactNode;
}) {
  const cta = headerCta(stats.phase);
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
            <Link href="/#how">活動方式</Link>
            <Link href="/nominate">提名</Link>
            <Link href="/#rules">規則與方法</Link>
            <Link href="/#faq">FAQ</Link>
          </nav>
          <Link className="cta cta--fill" href={cta.href}>
            {cta.label}
          </Link>
        </header>

        {children}
      </div>

      <footer>
        <div className="wrap colo">
          <div>
            <p className="word">{WORDMARK} · Taiwan → Japan 2026</p>
            <p>{DISCLAIMER}</p>
          </div>
          <div className="colo__meta">
            <div>
              <p>
                <Link href="/#rules">規則與方法</Link>
              </p>
              <p>
                <Link href="/#faq">FAQ</Link>
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
        </div>
      </footer>
    </>
  );
}
