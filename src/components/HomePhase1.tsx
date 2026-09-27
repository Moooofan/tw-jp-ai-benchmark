import {
  ArrowRight,
  CalendarDays,
  Info,
} from "lucide-react";
import Link from "next/link";
import { dateRange, hhmm, monthDay } from "@/lib/format";
import { isPhaseOne } from "@/lib/phase";
import type { Board, Stats } from "@/lib/types";
import BackgroundBand from "./BackgroundBand";
import Band from "./Band";
import Icon from "./Icon";
import NominationBoard, { BoardProvider } from "./NominationBoard";
import SiteChrome, { DISCLAIMER, NominateCta } from "./SiteChrome";


const faqItems = (): { q: string; a: string }[] => [
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
    a: "不會。被提名一次或很多次，都只代表這家公司已被提名。",
  },
  {
    q: "什麼樣的公司可以被提名？",
    a: "台灣新創，且過去五年在日本市場有公開可查的發展。",
  },
];


/**
 * `/` in every phase (spec v6 §3; owner 2026-09-27): one question, a
 * frictionless nomination entry. From `nominate_close` on it shows the
 * nomination period as ended — no form, frozen board — and, once Phase Two is
 * public, links to it (`phaseTwoHref`). It never renders Phase Two itself.
 * Server component.
 */
export default function HomePhase1({
  stats,
  board,
  phaseTwoHref,
}: {
  stats: Stats;
  board: Board;
  /** Set once Phase Two is public: the nominations-ended CTA points here. */
  phaseTwoHref?: string;
}) {
  const open = stats.phase === "nominate";
  const ended = !isPhaseOne(stats.phase);
  return (
    <SiteChrome stats={stats} home track="one" phaseTwoHref={phaseTwoHref}>
      <BoardProvider board={board} live={!ended}>
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
                {ended
                  ? "提名期間已結束，謝謝每一位提名的人。候選名單已凍結，不再接受新的提名。"
                  : "輸入公司名稱就能提名，不用註冊，也不用留 Email。"}
              </p>
              <ul className="herodates" aria-label="提名期間">
                <li className={open ? "is-now" : undefined}>
                  <Icon icon={CalendarDays} />
                  <span className="herodates__k">
                    {ended ? "提名期間（已結束）" : "提名期間"}
                  </span>
                  <span className="herodates__v">
                    {dateRange(stats.nominate_open, stats.nominate_close)}
                  </span>
                </li>
              </ul>
              <div className="hero__cta">
                {!ended ? (
                  <NominateCta stats={stats}>
                    <Icon icon={ArrowRight} />
                  </NominateCta>
                ) : phaseTwoHref ? (
                  <Link className="btn btn--red" href={phaseTwoHref}>
                    前往 Phase Two 投票
                    <Icon icon={ArrowRight} />
                  </Link>
                ) : (
                  <span className="btn btn--red btn--wait" aria-disabled="true">
                    Phase Two 投票將於 {monthDay(stats.vote_open)}{" "}
                    {hhmm(stats.vote_open)} 開放
                  </span>
                )}
                <a className="btn btn--line" href="#background">
                  先看前情提要
                </a>
              </div>
              <p className="hero__disc">
                <Icon icon={Info} />
                <span>
                  {DISCLAIMER}
                  <br />
                  發布單位：VM布爾喬亞新創服務事業群
                </span>
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

          <Band id="board" chip="Nomination Board" title="候選名單">
            <NominationBoard stats={stats} />
          </Band>

          <Band id="faq" chip="FAQ" title="常見問題">
            <div className="acc">
              {faqItems().map((f) => (
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
