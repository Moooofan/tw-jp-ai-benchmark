import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Info,
  ListChecks,
  MessageSquareText,
  ThumbsUp,
  type LucideIcon,
} from "lucide-react";
import { hhmm, monthDay } from "@/lib/format";
import type { Stats, VoteBoard } from "@/lib/types";
import BackgroundBand from "./BackgroundBand";
import Band from "./Band";
import {
  BoardProvider,
  Leaderboard,
  ReasonTabs,
  ResonanceAndTrend,
  VoteStatStrip,
} from "./CommunityBoard";
import type { CloudWord } from "@/lib/wordcloud";
import Icon from "./Icon";
import KeywordStrip from "./KeywordStrip";
import { ReactionProvider } from "./Reactions";
import SiteChrome, { DISCLAIMER } from "./SiteChrome";

const RULES: { icon: LucideIcon; h: string; p: string }[] = [
  {
    icon: CalendarCheck,
    h: "每天一張票",
    p: "每個 Email 每天可以投一張票，台北時間午夜重置。",
  },
  { icon: ListChecks, h: "最多三家", p: "一張票最多選三家公司。" },
  {
    icon: MessageSquareText,
    h: "一定要說為什麼",
    p: "每家公司寫一句 10–50 字的理由",
  },
  {
    icon: ThumbsUp,
    h: "推與噓會影響票數",
    p: "每累積淨 10 個推，該公司 +1 票；淨 10 個噓，−1 票",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "一天可以投幾次？",
    a: "每個 Email 每天一張票，台北時間午夜重置。",
  },
  { q: "一張票可以選幾家？", a: "最多三家，每家要寫理由。" },
  { q: "推和噓有什麼用？", a: "淨 10 個推 = 1 票；淨 10 個噓 = −1 票。" },
  {
    q: "可以改票嗎？",
    a: "當天送出後不能修改，明天可以再投一張。",
  },
  {
    q: "我的 Email 會公開嗎？",
    a: "不會，只用來確認一人一天一張票。",
  },
  {
    q: "為什麼有些公司不在名單上？",
    a: "候選公司來自第一階段的提名；不符合資格的公司會被移除。",
  },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * `/` in vote / closed (spec v7b §1, §4): the Community Intelligence Page.
 * Server component; the board and reactions are client islands.
 */
export default function HomeVote({
  stats,
  board,
  cloud,
}: {
  stats: Stats;
  board: VoteBoard;
  cloud: CloudWord[];
}) {
  const closed = stats.phase === "closed";
  const label = stats.results_label.trim();
  return (
    <SiteChrome stats={stats} home>
      <BoardProvider initial={board}>
        <ReactionProvider open={!closed}>
          <div className="hero hero--p1">
            <div className="hero__ghost" aria-hidden="true">
              TAIWAN → JAPAN
            </div>
            <div className="wrap">
              <div>
                <span className="chip">TAIWAN → JAPAN 2026 · VOTE</span>
                <h1>
                  過去五年，
                  <br />
                  你認為哪些台灣新創
                  <br />
                  最值得作為<span className="hl">日本市場</span>發展案例？
                </h1>
                <p className="stand">
                  {closed
                    ? "投票已截止，感謝參與。"
                    : "現在開始正式投票：每天一張票，最多選三家，並告訴我們為什麼。"}
                </p>
                <div className="hero__cta">
                  {closed ? (
                    <a className="btn btn--red" href="#live">
                      直播預告
                      <Icon icon={ArrowRight} />
                    </a>
                  ) : (
                    <Link className="btn btn--red" href="/vote">
                      立即投票
                      <Icon icon={ArrowRight} />
                    </Link>
                  )}
                  <a className="btn btn--line" href="#leaderboard">
                    看排行榜
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
            <VoteStatStrip
              voteOpen={stats.vote_open}
              voteClose={stats.vote_close}
              closed={closed}
            />

            <BackgroundBand />

            <Band id="leaderboard" chip="01 · Leaderboard" title="排行榜">
              <Leaderboard />
              <p className="note">
                排行依票數即時計算；推與噓每累積淨 10 個，影響該公司 1 票。
              </p>
            </Band>

            <Band id="reasons" chip="02 · Why People Vote" title="熱門理由">
              <ReasonTabs />
              <KeywordStrip words={cloud} />
            </Band>

            <Band
              id="resonance"
              chip="03 · Community Resonance"
              title="社群共鳴與趨勢"
            >
              <ResonanceAndTrend />
            </Band>

            <Band id="rules" chip="04 · Rules" title="投票規則">
              <div className="grid g4">
                {RULES.map((r, i) => (
                  <article className="card" key={r.h}>
                    <div className="no">
                      <span>— RULE {pad2(i + 1)}</span>
                      <Icon icon={r.icon} lg />
                    </div>
                    <h3>{r.h}</h3>
                    <p>{r.p}</p>
                  </article>
                ))}
              </div>
              {stats.vote_close ? (
                <p className="deadline">
                  投票截止：{monthDay(stats.vote_close)} {hhmm(stats.vote_close)}
                </p>
              ) : null}
            </Band>

            <section id="live">
              <div className="liveband">
                <span className="chip">05 · Coming Up</span>
                <p className="liveband__big">
                  {label ? `${label}，直播揭曉` : "直播揭曉"}
                </p>
                <p className="liveband__sub">
                  Top 10、Top 3，以及大家沒看到的那一面。
                </p>
              </div>
            </section>

            <Band id="faq" chip="06 · FAQ" title="常見問題">
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
        </ReactionProvider>
      </BoardProvider>
    </SiteChrome>
  );
}
