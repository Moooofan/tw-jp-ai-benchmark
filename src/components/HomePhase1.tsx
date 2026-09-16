import {
  ArrowRight,
  Info,
} from "lucide-react";
import { dateRange } from "@/lib/format";
import type { Stats } from "@/lib/types";
import BackgroundBand from "./BackgroundBand";
import Band from "./Band";
import Icon from "./Icon";
import SiteChrome, { DISCLAIMER, NominateCta } from "./SiteChrome";


const faqItems = (stats: Stats): { q: string; a: string }[] => [
  {
    q: "需要註冊或留 Email 嗎？",
    a: "不需要。輸入公司名稱、確認是這家公司，就完成提名。",
  },
  {
    q: "找不到我要提名的公司怎麼辦？",
    a: "在搜尋結果最後選「找不到？直接提名」就可以。官方網站是選填，知道的話填一下，能幫我們更快辨識。",
  },
  {
    q: "同一家公司被提名很多次，會比較有利嗎？",
    a: "會。被提名的次數越多，這家公司的排名越前面。提名期結束後，前 10 名會進入第二階段投票。",
  },
  {
    q: "什麼樣的公司可以被提名？",
    a: "台灣新創，且過去五年在日本市場有公開可查的發展。",
  },
  {
    q: "活動時間怎麼安排？",
    a: `提名期間 ${dateRange(stats.nominate_open, stats.nominate_close)}；投票期間 ${dateRange(stats.vote_open, stats.vote_close)}；結果公布 ${stats.results_label}。`,
  },
];


/**
 * `/` in pre / nominate (spec v6 §3): one question, a frictionless nomination entry,
 * nothing about what happens next. Server component.
 */
export default function HomePhase1({ stats }: { stats: Stats }) {
  const open = stats.phase === "nominate";
  return (
    <SiteChrome stats={stats} home>
      <>
        <div className="hero hero--p1">
          <div className="hero__ghost" aria-hidden="true">
            TAIWAN → JAPAN
          </div>
          <div className="wrap">
            <div>
              <span className="chip">TAIWAN → JAPAN 2026</span>
              <h1>
                過去五年，
                <br />
                你認為哪些台灣新創
                <br />
                最值得作為<span className="hl">日本市場</span>發展案例？
              </h1>
              <p className="stand">
                輸入公司名稱就能提名，不用註冊，也不用留 Email。
              </p>
              <div className="hero__cta">
                <NominateCta stats={stats}>
                  <Icon icon={ArrowRight} />
                </NominateCta>
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
          <BackgroundBand ctaHref={open ? "/nominate" : "#faq"} />

          <Band id="faq" chip="FAQ" title="常見問題">
            <div className="acc">
              {faqItems(stats).map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <div className="a">{f.a}</div>
                </details>
              ))}
            </div>
          </Band>
        </div>
      </>
    </SiteChrome>
  );
}
