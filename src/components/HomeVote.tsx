import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { hhmm, monthDay } from "@/lib/format";
import { PHASE_TWO_PATH } from "@/lib/phase";
import type { Stats, VoteBoard } from "@/lib/types";
import Band from "./Band";
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
import SiteChrome, {
  CAMPAIGN_EN,
  CAMPAIGN_ZH,
  DISCLAIMER,
  STRATEGY_LINE,
} from "./SiteChrome";

/**
 * `/phase-two` — the Phase Two home. Copy is quoted from the execution memo
 * v3.0 (2026-09-27) 「四 可直接上線的頁面文案」 and the owner's HOW / OUTCOME
 * wording; first screen = Hero + three equal boxes WHY / HOW / OUTCOME
 * (memo §二, reference image TWJP_Phase2_Page_Reference_20260927).
 */

export const P2_TITLE = "把「我推薦誰」，變成「為什麼值得帶往日本」。";
export const P2_SUB =
  "透過人類票選與具體理由，找出最值得借鏡的赴日方法；再以 ximu 檢驗並公開演示 IQ Lite 的產出過程，讓選擇成為可以使用的市場決策。";

/** HOW, exactly as the owner fixed it (memo v3.0 §四; no ballot wording). */
const HOW_RULES: string[] = [
  "投票期間 9 月 28 日至 10 月 6 日",
  "每個 email 每天最多投給 3 家企業",
  "每投給 1 家企業都必須寫下具體理由",
  "每則理由累積 10 個有效讚，該企業增加 1 票",
  "倒讚只作為回饋，不扣除票數",
  "新案例取得第 11 個不同 email 支持後，以 1 票進入正式投票池",
  "Phase One 的提名數不帶入 Phase Two",
];

/** OUTCOME, exactly as the owner fixed it. */
const OUTCOME_ITEMS: string[] = [
  "公開 Community Top 10",
  "從 Top 10 產生 Top 3 Featured Companies",
  "Top 3 每家獲贈一份價值 US$180 的 IQ Lite 日本市場報告",
  "公開演示從 ximu 檢驗、分析到 IQ Lite 完成產出的完整過程",
];

/** 結果限制 (memo §五) + the reason-vote rule. */
const RESULT_NOTES: string[] = [
  "排序依正式票數即時計算；每則理由累積 10 個有效讚，該企業增加 1 票。倒讚只作為回饋，不扣除票數。",
  "這個結果反映社群在本階段認為值得借鏡的方法，不是營收、估值、成功或企業價值的客觀排名。",
];

/** FAQ: no media / profession / identity / weighting items (memo §六). */
const FAQ: { q: string; a: string }[] = [
  {
    q: "這是新創票選，為什麼成熟品牌也能參加？",
    a: "因為這次要找的是「值得借鏡的日本市場進入方法」，不是用成立年資或公司規模判定誰比較好。只要案例能提供可學習的方法，就值得被討論。",
  },
  {
    q: "Phase One 被提名很多次，會不會直接領先？",
    a: "不會。Phase One 的提名數只用來形成候選池，不帶入 Phase Two；正式票數重新計算。",
  },
  {
    q: "Phase Two 新增的公司如何進入正式投票？",
    a: "先成為待確認遺珠；取得第 11 個不同 email 的支持後，以 1 票進入正式投票池。",
  },
  {
    q: "為什麼資格支持不直接算成 11 票？",
    a: "資格支持回答的是「它是否值得進入候選池」；正式投票回答的是「它是否最值得借鏡」。兩個行為目的不同，因此分開計算。",
  },
  {
    q: "按讚與倒讚如何影響票數？",
    a: "每則理由累積 10 個有效讚，該企業增加 1 票；20 個讚增加 2 票，以此類推。倒讚只作為回饋，不扣除票數，也不抵銷按讚。",
  },
  {
    q: "結果是不是代表最成功的公司？",
    a: "不是。結果代表社群認為最值得借鏡的方法與理由，不等同客觀營運績效或公司價值排名。",
  },
];

/** IQ Lite proof cases (memo v3.0 §六). Reports are served as-is from public/cases/. */
const CASES = [
  {
    href: "/cases/figure-ai.html",
    tag: "海外新創",
    name: "Figure AI",
    topic: "人形機器人",
    line: "已進入 AI 比較名單；台灣市場入口仍要靠在地部署證據與夥伴角色補齊。",
  },
  {
    href: "/cases/palo-alto-networks.html",
    tag: "大型企業",
    name: "Palo Alto Networks",
    topic: "Agent 時代資安影響力",
    line: "在 AI 回答中取得領先可見度，但台灣人類注意力與比較型問題的優先排序尚未同步放大。",
  },
  {
    href: "/cases/junglia.html",
    tag: "日本市場",
    name: "JUNGLIA OKINAWA",
    topic: "台灣旅客的日本樂園選擇",
    line: "當前機會在於把情境內的 AI 優勢，接上台灣旅客的行程決策。",
  },
];

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
  const range =
    stats.vote_open && stats.vote_close
      ? `${monthDay(stats.vote_open)}–${monthDay(stats.vote_close)}`
      : "9/28–10/06";
  return (
    <SiteChrome stats={stats} home track="two">
      <BoardProvider initial={board}>
        <ReactionProvider open={!closed}>
          <div className="hero p2hero">
            <div className="wrap wrap--wide">
              <div className="p2hero__main">
                <p className="p2hero__kicker">
                  <span className="p2hero__zh">{CAMPAIGN_ZH}</span>
                  <span className="p2hero__en">{CAMPAIGN_EN}</span>
                  <span className="p2hero__phase">PHASE TWO | COMMUNITY VOTING</span>
                </p>
                <h1>
                  把「我推薦誰」，
                  <br />
                  變成「為什麼值得帶往日本」。
                </h1>
                <p className="p2hero__sub">{P2_SUB}</p>
              </div>
              <div className="p2hero__act">
                {closed ? (
                  <a className="btn p2hero__cta" href="#results">
                    看目前結果
                    <Icon icon={ArrowRight} />
                  </a>
                ) : (
                  <Link className="btn p2hero__cta" href="/vote">
                    開始投票
                    <Icon icon={ArrowRight} />
                  </Link>
                )}
                <p className="p2hero__meta">
                  {closed ? (
                    "投票已截止，結果整理中"
                  ) : (
                    <>
                      <span>{range}</span> · <span>每個 email 每天最多投給 3 家企業</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="wrap wrap--wide">
            <div className="p2boxes">
              <section className="p2box" aria-labelledby="box-why">
                <p className="p2box__k">01 · WHY</p>
                <h2 id="box-why">我們為什麼做</h2>
                <p className="p2box__lead">
                  提名讓我們看見情感與意圖；Phase Two 要找出哪些赴日方法值得理解、借鏡與複用。
                </p>
                <ul className="p2box__list">
                  <li>蒐集人類的選擇、理由與共鳴</li>
                  <li>以 Humans + AI 共同判讀，形成形象資產</li>
                  <li>找出日本市場的機會與定向增長方法</li>
                </ul>
                <a className="p2box__more" href="#why">
                  從推薦意圖，走向決策依據
                  <Icon icon={ArrowDown} />
                </a>
              </section>

              <section className="p2box" aria-labelledby="box-how">
                <p className="p2box__k">02 · HOW</p>
                <h2 id="box-how">怎麼投</h2>
                <ul className="p2box__list p2box__list--rules">
                  {HOW_RULES.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <a className="p2box__more" href="#how">
                  完整規則
                  <Icon icon={ArrowDown} />
                </a>
              </section>

              <section className="p2box p2box--deep" aria-labelledby="box-outcome">
                <p className="p2box__k">03 · OUTCOME</p>
                <h2 id="box-outcome">投完之後</h2>
                <p className="p2box__lead">
                  讓選擇不只停在名次，而是經過檢驗，成為可以採取行動的市場判斷。
                </p>
                <ul className="p2box__list">
                  {OUTCOME_ITEMS.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <a className="p2box__more" href="#outcome">
                  報告、示範與後續公開
                  <Icon icon={ArrowDown} />
                </a>
              </section>
            </div>

            <div className="p2spine" aria-label="策略主軸">
              <span>形象資產治理</span>
              <i aria-hidden="true">→</i>
              <span>Humans + AI 決策</span>
              <i aria-hidden="true">→</i>
              <span>定向增長</span>
              <small>{STRATEGY_LINE}</small>
            </div>
          </div>

          <div className="wrap wrap--wide votepage">
            <VoteStatStrip
              voteOpen={stats.vote_open}
              voteClose={stats.vote_close}
              closed={closed}
            />

            <Band id="why" chip="01 · Why" title="我們為什麼做">
              <p className="lead">
                Phase One 呈現的是「人類看見誰、願意推薦誰」。但看見與推薦本身，還不足以支持真正的市場行動。Phase Two 要進一步取得：人們選擇誰、為什麼選擇、哪些理由得到更多人支持，以及這些理由是否能經過檢驗，轉化為進入日本市場的決策依據。
              </p>
              <p className="para">
                人的觀察帶有情感、經驗與意圖；AI 則是資訊收集、理解與擴散的重要入口。這次不是單獨談 AI，而是透過 Humans + AI 的共同判讀，把票選與理由轉化為可管理的形象資產，進一步找出日本市場的機會、賽道與定向增長方法。
              </p>
            </Band>

            <Band id="how" chip="02 · How" title="怎麼投">
              <ul className="rulelist" id="rules">
                {HOW_RULES.map((r) => (
                  <li key={r}>{r}。</li>
                ))}
              </ul>
              <p className="note">
                理由請寫下具體做法，而不只是一句「我喜歡這家公司」。同一公司若以不同名稱出現，系統會依官方網域合併，避免票數分散；按讚以 email 去重。
              </p>
              {stats.vote_close ? (
                <p className="deadline">
                  投票截止：{monthDay(stats.vote_close)} {hhmm(stats.vote_close)}
                </p>
              ) : null}
              {closed ? null : (
                <div className="howcta">
                  <Link className="btn btn--red" href="/vote">
                    開始投票
                    <Icon icon={ArrowRight} />
                  </Link>
                </div>
              )}
            </Band>

            <Band id="results" chip="Community Signal" title="目前的社群判斷">
              <ResultBoard />
              {RESULT_NOTES.map((n) => (
                <p className="note" key={n}>
                  {n}
                </p>
              ))}
            </Band>

            <Band id="candidates" chip="Missing Cases" title="沒有看到你心中的遺珠">
              <p className="lead">
                你仍然可以提出新的企業案例。新的公司會先進入「待確認遺珠」，取得第 11 個不同 email 的支持後，以 1 票進入正式投票池。
              </p>
              <div className="howcta">
                <Link className="btn btn--red" href="/candidates">
                  提名一個遺珠
                  <Icon icon={ArrowRight} />
                </Link>
              </div>
            </Band>

            <Band id="reasons" chip="Reasons" title="為值得認同的理由按讚">
              <p className="lead">
                投票之外，你也可以對其他人的理由按讚。每則理由累積 10 個有效讚，該企業增加 1 票；20 個讚增加 2 票，以此類推。
              </p>
              <p className="note">{DISLIKE_NOTE}</p>
              <ReasonTabs />
              <KeywordStrip words={cloud} />
              <ResonanceAndTrend />
            </Band>

            <Band id="outcome" chip="03 · Outcome" title="投完之後">
              <ul className="rulelist">
                {OUTCOME_ITEMS.map((r) => (
                  <li key={r}>{r}。</li>
                ))}
                <li>後續公開報告、示範影片與橫向市場觀察。</li>
              </ul>
              <p className="para p2outcome__close">
                這不是抽象的獎勵，而是讓市場實際看到：一個人類的選擇與理由，如何經過檢驗，成為可採取行動的市場判斷與形象資產。
              </p>
            </Band>

            <Band id="cases" chip="Proof Cases" title="IQ Lite 報告實例">
              <p className="para">
                先看懂 ximu 與 IQ Lite 如何把公開資訊，轉成形象資產判讀與市場決策。
              </p>
              <div className="casegrid">
                {CASES.map((c) => (
                  <a
                    key={c.href}
                    className="casecard"
                    href={c.href}
                    target="_blank"
                    rel="noopener"
                  >
                    <span className="casecard__tag">{c.tag}</span>
                    <strong className="casecard__name">{c.name}</strong>
                    <span className="casecard__topic">{c.topic}</span>
                    <span className="casecard__line">{c.line}</span>
                    <span className="casecard__go">
                      看完整報告
                      <Icon icon={ArrowRight} />
                    </span>
                  </a>
                ))}
              </div>
              <p className="casenote">
                資料整理與初步報告由 ximu Agent 完成，並經 Human Analyst Review 校準其決策意義。
              </p>
            </Band>

            <section id="closing">
              <div className="liveband">
                <p className="liveband__big">
                  把你看見的方法，留給下一個準備進入日本市場的人。
                </p>
                <p className="liveband__sub">
                  每個 email 每天最多投給 3 家企業，每家都寫下具體理由。
                </p>
                <div className="liveband__cta">
                  {closed ? (
                    <a className="btn btn--line" href="#results">
                      看目前結果
                      <Icon icon={ArrowRight} />
                    </a>
                  ) : (
                    <Link className="btn btn--red" href="/vote">
                      開始投票
                      <Icon icon={ArrowRight} />
                    </Link>
                  )}
                  <span className="liveband__share">
                    <span className="liveband__sharek">分享投票頁</span>
                    <ShareRow text={P2_TITLE} path={PHASE_TWO_PATH} />
                  </span>
                </div>
              </div>
            </section>

            <Band id="faq" chip="FAQ" title="常見問題">
              <div className="acc">
                {FAQ.map((f) => (
                  <details key={f.q}>
                    <summary>{f.q}</summary>
                    <div className="a">{f.a}</div>
                  </details>
                ))}
              </div>
              <p className="note">{DISCLAIMER}</p>
            </Band>
          </div>
        </ReactionProvider>
      </BoardProvider>
    </SiteChrome>
  );
}
