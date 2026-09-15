import {
  Activity,
  Compass,
  Crosshair,
  Eye,
  FileText,
  Link as LinkIcon,
  ListChecks,
  MessageSquareText,
  Newspaper,
  Scale,
  Search,
  Target,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { Stats } from "@/lib/types";
import Band from "./Band";
import Icon from "./Icon";
import type { StorySlots } from "./SiteClient";
import type { ChromeStory } from "./SiteChrome";

/*
 * Results-phase story (spec v6 §1): ximu, IQ Lite, AI Representation, the Top 3
 * prize, Your Market, partners. SERVER-ONLY module — never import it from a
 * "use client" file, or this copy ships in the Phase 1 JavaScript. Pages call
 * these only when reveal(phase).story is true.
 */

const DEFAULT_LINK = "https://ximu-geo.com/zh-TW";

const QUESTIONS: { icon: LucideIcon; text: string }[] = [
  {
    icon: Search,
    text: "當日本使用者詢問相關產品或服務時，AI 是否會提到這家公司？",
  },
  { icon: MessageSquareText, text: "AI 如何描述它的定位、能力與競爭者？" },
  { icon: LinkIcon, text: "AI 的答案引用哪些來源，又缺少哪些可信資訊？" },
];

const PRIZES: { icon: LucideIcon; text: string }[] = [
  { icon: FileText, text: "IQ Lite Japan Edition 報告一份" },
  { icon: UserCheck, text: "ximu Intelligence 分析與 Human Analyst Review" },
  { icon: Crosshair, text: "日本市場的 AI Representation 診斷" },
  { icon: LinkIcon, text: "來源與引用環境檢視" },
  { icon: Scale, text: "競爭定位比較" },
  { icon: ListChecks, text: "目前最值得處理的優先行動" },
  { icon: Newspaper, text: "公開案例曝光" },
];

const PILLARS: { icon: LucideIcon; h: string; p: string }[] = [
  { icon: Eye, h: "SEE", p: "AI 如何理解與描述這家公司？" },
  { icon: Scale, h: "COMPARE", p: "公司與主要競爭者在 AI 答案中有何不同？" },
  { icon: Target, h: "DECIDE", p: "目前最值得優先處理的三項行動是什麼？" },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

export const STORY_CHROME: ChromeStory = {
  wordmark: "AI Representation Benchmark",
  small: "Taiwan → Japan · 2026",
  copyright: "© 2026 ximu",
};

export function storySlots(stats: Stats): StorySlots {
  return {
    chip: "Taiwan → Japan AI Representation Benchmark 2026",
    standMore:
      "前三高票公司將獲得 IQ Lite Japan Edition，進一步檢視它們在日本 AI 決策環境中如何被看見、理解與推薦。",
    step4: {
      h: "ximu 分析與公開發布",
      p: "前三高票公司獲得 IQ Lite Japan Edition，報告與 Benchmark 將公開提供下載。",
    },
    chrome: STORY_CHROME,
    why: (
      <Band
        id="why"
        chip="Why It Matters"
        title="在台灣被看見，不代表在日本的 AI 世界也被看見"
      >
        <p className="lead">
          越來越多日本企業與使用者透過 AI
          尋找供應商、比較方案、做出第一輪判斷。一家台灣新創在日本市場的存在感，正在由
          AI 的答案決定。這個 Benchmark 要回答的，是市場看不到的三個問題。
        </p>
        <div className="grid g3">
          {QUESTIONS.map((q, i) => (
            <article className="card card--q" key={q.text}>
              <div className="no">
                <span>— Q. {pad2(i + 1)}</span>
                <Icon icon={q.icon} lg />
              </div>
              <h3>{q.text}</h3>
            </article>
          ))}
        </div>
        <p className="note">
          Taiwan → Japan AI Representation Benchmark
          將以社群提名建立案例池，再用 ximu 與 Human Analyst Review
          分析市場看不到的 AI Representation。
        </p>
      </Band>
    ),
    prize: (
      <Band
        id="prize"
        chip="Featured Companies"
        title="Top 3 Featured Companies 將獲得什麼"
      >
        <p className="lead">
          前三高票公司各獲得一份 IQ Lite Japan Edition，由 ximu Intelligence 加
          Human Analyst Review 完成並公開。
        </p>
        <div className="listcard">
          <ul className="lst">
            {PRIZES.map((g, i) => (
              <li
                key={g.text}
                style={
                  i === PRIZES.length - 1 ? { borderBottom: 0 } : undefined
                }
              >
                <Icon icon={g.icon} />
                {g.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="price">
          <span className="tag">IQ LITE 定價 US$180</span>
          <span className="note" style={{ margin: 0 }}>
            報告將在取得必要授權後公開提供下載。
          </span>
        </div>

        <h3 className="subhead" id="iqlite">
          一份 IQ Lite 回答三個完整問題
        </h3>
        <div className="grid g3">
          {PILLARS.map((pl) => (
            <article className="card" key={pl.h}>
              <div className="no">
                <span className="big">{pl.h}</span>
                <Icon icon={pl.icon} lg />
              </div>
              <h3>{pl.p}</h3>
            </article>
          ))}
        </div>
        <p className="note">
          IQ Lite 提供一次性的市場 Snapshot。ximu
          用於持續觀察市場、Query、競爭狀態與 AI Representation 的變化。
        </p>
      </Band>
    ),
    convert: (
      <section id="convert">
        <div className="band">
          <span className="chip">Your Market</span>
          <h2>從 Benchmark 到你自己的市場位置</h2>
        </div>
        <div className="body grid g2">
          <div className="conv">
            <Icon icon={Compass} lg />
            <h3>想看見自己的市場位置？</h3>
            <p>
              取得一份針對單一市場與商業問題的標準化 AI Representation 診斷。
            </p>
            <a
              className="btn btn--brand"
              href={stats.iqlite_url || DEFAULT_LINK}
              target="_blank"
              rel="noopener noreferrer"
            >
              Get Your IQ Lite — US$180
            </a>
          </div>
          <div className="conv">
            <Icon icon={Activity} lg />
            <h3>想持續掌握市場如何改變？</h3>
            <p>
              IQ Lite 提供一次性的市場 Snapshot；ximu
              用於持續觀察市場、Query、競爭狀態與 AI Representation 的變化。
            </p>
            <a
              className="btn btn--ghost"
              href={stats.ximu_url || DEFAULT_LINK}
              target="_blank"
              rel="noopener noreferrer"
            >
              Start with ximu
            </a>
          </div>
        </div>
      </section>
    ),
    faqPrize: (
      <details>
        <summary>前三名會得到什麼？</summary>
        <div className="a">
          一份公開的 IQ Lite Japan Edition，回答三件事：AI
          如何理解與描述這家公司、公司與主要競爭者在 AI
          答案中有何不同、目前最值得優先處理的行動。報告將在取得必要授權後公開提供下載。
        </div>
      </details>
    ),
    partners: (
      <div className="partners" id="partners">
        <span className="chip">Ecosystem and Media Partners</span>
        <div>{stats.partners_text}</div>
      </div>
    ),
  };
}
