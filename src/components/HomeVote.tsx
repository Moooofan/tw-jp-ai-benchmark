import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import { hhmm, monthDay } from "@/lib/format";
import type { Stats, VoteBoard } from "@/lib/types";
import Band from "./Band";
import Phrases from "./Phrases";
import {
  BoardProvider,
  ReasonTabs,
  ResonanceAndTrend,
  ResultBoard,
  VoteStatStrip,
} from "./CommunityBoard";
import type { CloudWord } from "@/lib/wordcloud";
import Icon from "./Icon";
import KeywordStrip from "./KeywordStrip";
import { DISLIKE_NOTE, ReactionProvider } from "./Reactions";
import ShareRow from "./ShareRow";
import SiteChrome, { DISCLAIMER } from "./SiteChrome";

/**
 * Every line below is quoted from the locked document
 * `phase2-locked-doc-v1.0` 「完整投票頁面文案」 (v1.0, 2026-09-24, decision
 * maker JT) and must not be paraphrased, shortened or "improved" — spec v8 §4.
 */

const H1 = "如果你準備進入日本市場，哪一家台灣企業的做法最值得借鏡？";

const ANGLES: { k: string; p: string }[] = [
  { k: "市場進入", p: "它如何找到第一個切入點？" },
  { k: "在地化", p: "它如何調整產品、服務、定價或溝通？" },
  { k: "品牌與信任", p: "它如何被日本消費者、客戶或夥伴接受？" },
  { k: "通路與夥伴", p: "它如何選擇合作方式、銷售路徑或在地資源？" },
  { k: "組織與執行", p: "它如何承擔長期投入、反覆調整與跨文化協作？" },
  { k: "其他", p: "任何你認為其他台灣企業可以帶走的具體經驗。" },
];

const VOTE_RULES: string[] = [
  "每個 email 每日有 1 張選票，每張最多選擇 3 家公司。",
  "每投給一家公司，都必須留下具體理由；理由會成為這次研究與市場觀察的一部分。",
  "每個人、每種身分的票值都相同。媒體、投資人、VC、創辦人、工作者與一般參與者，不另設票池，也不加權。",
  "Phase 1 的提名次數只用來形成候選池，不帶入本階段正式票數。",
  "同一公司若以不同名稱出現，系統會依公司識別資料合併，避免票數分散。",
];

/** 結果區 notes, verbatim (spec v8 §5). */
const RESULT_NOTES: string[] = [
  "排序依正式票數即時計算；每一則理由每滿 10 個有效按讚，替該公司增加 1 票。倒讚僅供回饋，不扣票。",
  "這個結果代表社群認為最值得借鏡的方法，不是營收、估值或公司成敗的排名。",
];

/** The document's seven questions, replacing the six v7b ones (spec v8 §4). */
const FAQ: { q: string; a: string }[] = [
  {
    q: "這是新創票選，為什麼成熟品牌也能參加？",
    a: "因為這次要找的是「值得借鏡的日本市場進入方法」，不是用成立年資或公司規模判定誰比較好。只要案例能提供可學習的方法，就值得被討論。",
  },
  {
    q: "Phase 1 被提名很多次，會不會直接領先？",
    a: "不會。Phase 1 提名次數只用來形成候選池。進入 Phase 2 後，正式票數重新計算。",
  },
  {
    q: "Phase 2 新增的公司如何進入正式投票？",
    a: "先成為待確認遺珠；取得第 11 個不同、有效 email 支持後進入正式投票池，並以 1 票起算。",
  },
  {
    q: "為什麼資格支持不直接算成 11 票？",
    a: "資格支持回答的是「它是否值得進入候選池」；正式投票回答的是「它是否最值得借鏡」。兩個行為目的不同，因此分開計算。",
  },
  {
    q: "按讚與倒讚如何影響票數？",
    a: "每一則理由每滿 10 個有效按讚，替公司增加 1 票。倒讚只作為回饋，不扣票、不抵銷按讚。",
  },
  {
    q: "媒體的票比較重要嗎？",
    a: "不會。媒體是重要的 outreach 對象，但與所有參與者使用相同規則與相同票值。",
  },
  {
    q: "結果是不是代表最成功的公司？",
    a: "不是。結果代表社群認為最值得借鏡的方法與理由，不等同客觀營運績效或公司價值排名。",
  },
];

/**
 * `/` in vote / closed: the phase-2 voting page (spec v8 §4–§5), rewritten to
 * the locked document's copy and section order. Server component; the result
 * area and the reactions are client islands.
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
                <span className="chip">TAIWAN → JAPAN 2026</span>
                <h1>{H1}</h1>
                <p className="stand">
                <Phrases>{`無論是剛起步的新創、平台型企業、上市櫃公司，或已經成熟的品牌，只要它正在或已經進入日本市場，就可能有值得我們學習的方法。不是因為它大就更好，也不是因為它小就該被忽略。`}</Phrases>
              </p>
                <div className="hero__cta">
                  {closed ? (
                    <a className="btn btn--red" href="#results">
                      看目前結果
                      <Icon icon={ArrowRight} />
                    </a>
                  ) : (
                    <Link className="btn btn--red" href="/vote">
                      開始投票
                      <Icon icon={ArrowRight} />
                    </Link>
                  )}
                  <Link className="btn btn--line" href="/candidates">
                    提名遺珠之憾
                  </Link>
                </div>
                <p className="hero__disc">
                  <Icon icon={Info} />
                  <span>{DISCLAIMER}</span>
                </p>
              </div>
              <div className="vert" aria-hidden="true">
                <span>台灣企業</span>
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

            <Band id="why" chip="01 · Why" title="為什麼要做這次投票" bodyClass="wide">
              <p className="lead">
                <Phrases>{`進入日本市場，對任何外國企業都不容易。真正值得我們討論的，不只是誰成功、誰最大、誰最新，而是它做對了什麼：如何找到市場切入點、建立信任、調整產品、選擇通路，並把一次嘗試變成可持續的市場存在。`}</Phrases>
              </p>
            </Band>

            <Band id="question" chip="02 · The Question" title="這次要回答的問題">
              <div className="qbox">
                <span className="qbox__k">投票題目</span>
                <p className="qbox__q">
                  如果你是準備進入日本市場的台灣新創，你認為哪一家台灣企業的做法最值得借鏡？為什麼？
                </p>
              </div>
              <p className="para">
                <Phrases>{`請不要只選一個熟悉的名字。告訴我們：它哪一個做法值得學？如果換成另一家公司，這個方法是否仍然有用？`}</Phrases>
              </p>
              <h3 className="subh">你可以從哪些角度回答</h3>
              <ul className="angles">
                {ANGLES.map((a) => (
                  <li key={a.k}>
                    <b>{a.k}</b>
                    <span>{a.p}</span>
                  </li>
                ))}
              </ul>
            </Band>

            <Band id="who" chip="03 · Who" title="誰可以被投票" bodyClass="wide">
              <p className="lead">
                <Phrases>{`我們不以公司大小、成立年資或是否上市櫃作為排除條件。早期新創、平台型公司、成熟品牌、大型企業，都可以成為案例。`}</Phrases>
              </p>
              <p className="para">
                <Phrases>{`鼎泰豐算不算新創？每個人的答案可能不同。但只要它進入日本市場的做法值得其他台灣企業借鏡，就值得被討論。重點不是替公司貼上什麼標籤，而是說清楚我們可以從它身上學到什麼。`}</Phrases>
              </p>
            </Band>

            <Band id="rules" chip="04 · Rules" title="投票規則">
              <ul className="rulelist">
                {VOTE_RULES.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              {stats.vote_close ? (
                <p className="deadline">
                  投票截止：{monthDay(stats.vote_close)} {hhmm(stats.vote_close)}
                </p>
              ) : null}
            </Band>

            <Band
              id="results"
              chip="05 · Community Signal"
              title="目前的社群判斷"
            >
              <ResultBoard />
              {RESULT_NOTES.map((n) => (
                <p className="note" key={n}>
                  {n}
                </p>
              ))}
            </Band>

            <Band
              id="candidates"
              chip="06 · Missing Cases"
              title="沒有看到你心中的遺珠"
            >
              <p className="lead">
                <Phrases>{`你仍然可以提出新的企業案例。新的公司會先進入「待確認遺珠」，取得超過 10
                個有效支持，也就是第 11 個不同 email 的支持後，才會正式進入投票池。`}</Phrases>
              </p>
              <p className="para">
                <Phrases>{`當它進入正式投票池，先前的資格支持不會直接變成 11 票；它會以 1
                票起算，接下來和所有正式候選使用相同規則。你可以分享候選連結，邀請更多人支持它進入正式投票。`}</Phrases>
              </p>
              <div className="howcta">
                <Link className="btn btn--red" href="/candidates">
                  提名一個遺珠
                  <Icon icon={ArrowRight} />
                </Link>
              </div>
            </Band>

            <Band id="reasons" chip="07 · Reasons" title="為值得認同的理由按讚" bodyClass="wide">
              <p className="lead">
                <Phrases>{`投票之外，你也可以對其他人的理由按讚。每一則理由每累積 10
                個有效按讚，就替該公司增加 1 票；20 個按讚增加 2 票，以此類推。`}</Phrases>
              </p>
              <p className="para">
                <Phrases>{`反對／倒讚可以保留為社群回饋，但不會扣除公司票數，也不會抵銷按讚所增加的票。這個設計要獎勵有共鳴、有啟發性的理由，而不是用負面反應懲罰候選公司。`}</Phrases>
              </p>
              <p className="note">{DISLIKE_NOTE}</p>
              <ReasonTabs />
              <KeywordStrip words={cloud} />
              <ResonanceAndTrend />
            </Band>

            <Band id="media" chip="08 · Media" title="關於媒體參與" bodyClass="wide">
              <p className="lead">
                <Phrases>{`媒體是我們會主動邀請的重要參與者之一，因為他們長期觀察產業，也能讓更多案例被看見。但媒體不比創業者、投資人或一般參與者更高一等：大家使用同一入口、遵守同一規則、一人同一票值。`}</Phrases>
              </p>
            </Band>

            <Band id="meaning" chip="09 · What It Means" title="這個結果代表什麼" bodyClass="wide">
              <p className="lead">
                <Phrases>{`最終結果代表社群在這段期間內，對「哪些進入日本市場的方法最值得借鏡」的集體判斷。它不是營收榜、估值榜、公司成敗榜，也不是對任何企業的客觀定論。`}</Phrases>
              </p>
              <p className="para">
                <Phrases>{`我們更在意的是：哪些理由被大家認同、哪些方法可以跨公司複用、哪些市場進入經驗值得下一批台灣團隊帶走。`}</Phrases>
              </p>
            </Band>

            <section id="closing">
              <div className="liveband">
                <p className="liveband__big">
                  把你看見的方法，留給下一個準備進入日本市場的人。
                </p>
                <p className="liveband__sub">
                  選出你認為最值得借鏡的企業，並告訴我們為什麼。
                </p>
                <div className="liveband__cta">
                  {closed ? (
                    <a className="btn btn--line" href="#results">
                      看目前結果
                      <Icon icon={ArrowRight} />
                    </a>
                  ) : (
                    <Link className="btn btn--red" href="/vote">
                      立即投票
                      <Icon icon={ArrowRight} />
                    </Link>
                  )}
                  <span className="liveband__share">
                    <span className="liveband__sharek">分享投票頁</span>
                    <ShareRow text={H1} />
                  </span>
                </div>
              </div>
            </section>

            <Band id="faq" chip="10 · FAQ" title="常見問題">
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
