import {
  ArrowRight,
  CalendarDays,
  Info,
  Megaphone,
  PenLine,
  Search,
  SquareCheckBig,
  type LucideIcon,
} from "lucide-react";
import { dateRange } from "@/lib/format";
import type { Stats } from "@/lib/types";
import BackgroundBand from "./BackgroundBand";
import Band from "./Band";
import Icon from "./Icon";
import SiteChrome, { DISCLAIMER, NominateCta } from "./SiteChrome";

const STEPS: { icon: LucideIcon; h: string; p: string }[] = [
  { icon: Search, h: "輸入公司名稱", p: "中文、英文、品牌名都可以。" },
  {
    icon: SquareCheckBig,
    h: "確認是這家公司",
    p: "我們會顯示公司名稱與官方網站。",
  },
  {
    icon: PenLine,
    h: "寫一句提名理由",
    p: "10–50 字，告訴大家為什麼是它。",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "需要註冊嗎？",
    a: "不需要註冊。輸入公司名稱、寫一句理由並留下 Email 就完成提名，Email 不會公開。",
  },
  {
    q: "找不到我要提名的公司怎麼辦？",
    a: "輸入它的官方網站，我們會用網域辨識是哪一家公司。",
  },
  {
    q: "同一家公司被提名很多次，會比較有利嗎？",
    a: "不會。被提名一次或很多次，都只代表這家公司已被提名。",
  },
  {
    q: "什麼樣的公司可以被提名？",
    a: "台灣新創，且過去五年在日本市場有公開可查的發展。",
  },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

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
                輸入公司名稱、寫一句理由就能提名，不用註冊。
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
          <div className="sched" aria-label="時程安排">
            <div className={open ? "sc now" : "sc"}>
              <Icon icon={CalendarDays} />
              <span className="k">提名期間</span>
              <span className="v">
                {dateRange(stats.nominate_open, stats.nominate_close)}
              </span>
            </div>
            <div className="sc">
              <Icon icon={SquareCheckBig} />
              <span className="k">投票期間</span>
              <span className="v">
                {dateRange(stats.vote_open, stats.vote_close)}
              </span>
            </div>
            <div className="sc">
              <Icon icon={Megaphone} />
              <span className="k">結果公布</span>
              <span className="v">{stats.results_label}</span>
            </div>
          </div>

          <BackgroundBand ctaHref={open ? "/nominate" : "#how"} />

          <Band id="how" chip="How To Nominate" title="提名說明">
            <div className="grid g3">
              {STEPS.map((s, i) => (
                <article className="card" key={s.h}>
                  <div className="no">
                    <span>— STEP {pad2(i + 1)}</span>
                    <Icon icon={s.icon} lg />
                  </div>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </article>
              ))}
            </div>
            <div className="howcta">
              <NominateCta stats={stats}>
                <Icon icon={ArrowRight} />
              </NominateCta>
            </div>
          </Band>

          <Band id="faq" chip="FAQ" title="常見問題">
            <div className="acc">
              {FAQ.map((f) => (
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
