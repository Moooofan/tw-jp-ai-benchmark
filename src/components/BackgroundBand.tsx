import {
  ArrowRight,
  Flag,
  Layers,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import Band from "./Band";
import Icon from "./Icon";

/* Verbatim copy from prototype/campaign-v5.html, paired with its icons. */
const BACKGROUND: { icon: LucideIcon; h: string; p: string }[] = [
  {
    icon: TrendingUp,
    h: "越來越多台灣新創前進日本",
    p: "從軟體服務、硬體製造到消費品牌，日本成為許多團隊跨出台灣後，優先布局的市場之一。",
  },
  {
    icon: Flag,
    h: "已經有不少公司站穩腳步",
    p: "有人在日本找到長期客戶，有人設立據點、組建在地團隊，一步步建立市場信任。",
  },
  {
    icon: Layers,
    h: "但這些經驗很少被整理在一起",
    p: "成功的做法散落在各自的故事裡，外界很難看清楚：這些公司究竟是怎麼被日本市場認識的。",
  },
];

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * 前情提要 (BACKGROUND). Copy unchanged since spec v5; shared by every phase.
 * Without `ctaHref` (vote / closed, when nominations are over) the 我要提名
 * button is left out; the copy stays verbatim.
 */
export default function BackgroundBand({ ctaHref }: { ctaHref?: string }) {
  return (
    <Band id="background" chip="Background" title="前情提要：為什麼做這份調查">
      <p className="lead">
        這幾年，越來越多台灣新創把<b>日本</b>
        當作走向國際的重要一站。我們一直在關注台灣新創如何在國際市場站穩腳步，而日本，正是累積了許多值得討論案例的市場。
      </p>
      <div className="grid g3">
        {BACKGROUND.map((c, i) => (
          <article className="card" key={c.h}>
            <div className="no">
              <span>— NO. {pad2(i + 1)}</span>
              <Icon icon={c.icon} lg />
            </div>
            <h3>{c.h}</h3>
            <p>{c.p}</p>
          </article>
        ))}
      </div>
      <div className="statement">
        <p>
          所以我們發起這份調查，邀請熟悉台灣新創的你，一起提名最值得作為日本市場發展案例的公司。
        </p>
        {ctaHref ? (
          <a className="btn btn--brand" href={ctaHref}>
            我要提名
            <Icon icon={ArrowRight} />
          </a>
        ) : null}
      </div>
    </Band>
  );
}
