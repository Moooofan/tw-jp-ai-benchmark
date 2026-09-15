import {
  ArrowRight,
  Building2,
  CalendarDays,
  Clock,
  Info,
  PartyPopper,
  Search,
  SquareCheckBig,
  type LucideIcon,
} from "lucide-react";
import { dateRange } from "@/lib/format";
import type { Board, Stats } from "@/lib/types";
import BackgroundBand from "./BackgroundBand";
import Band from "./Band";
import Icon from "./Icon";
import NominationBoard, {
  BoardProvider,
  BoardTotal,
  BoardUpdated,
} from "./NominationBoard";
import SiteChrome, { DISCLAIMER, NominateCta } from "./SiteChrome";

const STEPS: { icon: LucideIcon; h: string; p: string }[] = [
  { icon: Search, h: "輸入公司名稱", p: "中文、英文、品牌名都可以。" },
  {
    icon: SquareCheckBig,
    h: "確認是這家公司",
    p: "我們會顯示公司名稱與官方網站。",
  },
  {
    icon: PartyPopper,
    h: "完成提名",
    p: "同一家公司可以被很多人提名，名單每小時更新。",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "需要註冊或留 Email 嗎？",
    a: "不需要。輸入公司名稱、確認後就完成提名。",
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
  { q: "名單多久更新？", a: "大約每小時更新一次。" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * `/` in pre / nominate (spec v6 §3): one question, a live nomination board,
 * nothing about what happens next. Server component; only the board is
 * interactive.
 */
export default function HomePhase1({
  stats,
  board,
}: {
  stats: Stats;
  board: Board;
}) {
  const open = stats.phase === "nominate";
  return (
    <SiteChrome stats={stats} home>
      <BoardProvider board={board}>
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
                <a className="btn btn--line" href="#board">
                  看看大家提名了誰
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
          <div className="sched" aria-label="提名概況">
            <div className={open ? "sc now" : "sc"}>
              <Icon icon={CalendarDays} />
              <span className="k">提名期間</span>
              <span className="v">
                {dateRange(stats.nominate_open, stats.nominate_close)}
              </span>
            </div>
            <div className="sc">
              <Icon icon={Building2} />
              <span className="k">已被提名的公司</span>
              <span className="v">
                <span className="num">
                  <BoardTotal />
                </span>{" "}
                家
              </span>
            </div>
            <div className="sc">
              <Icon icon={Clock} />
              <span className="k">最近更新</span>
              <span className="v">
                <span className="num">
                  <BoardUpdated />
                </span>
              </span>
            </div>
          </div>

          <BackgroundBand ctaHref={open ? "/nominate" : "#how"} />

          <Band id="board" chip="Nomination Board" title="候選名單">
            <p className="notice">
              這是提名名單，不是排名，也不是最終結果。同一家公司被提名多次，只代表它已被提名。
            </p>
            <NominationBoard stats={stats} />
          </Band>

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
      </BoardProvider>
    </SiteChrome>
  );
}
