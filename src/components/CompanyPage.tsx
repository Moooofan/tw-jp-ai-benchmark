import Link from "next/link";
import {
  ArrowRight,
  ExternalLink,
  MessageSquareText,
  Trophy,
  Vote,
} from "lucide-react";
import type { CloudWord } from "@/lib/wordcloud";
import type { CompanyDetail, Stats } from "@/lib/types";
import Band from "./Band";
import Icon from "./Icon";
import { ReactionProvider, ReasonCard } from "./Reactions";
import SiteChrome from "./SiteChrome";
import WordCloud from "./WordCloud";

const nf = new Intl.NumberFormat("en-US");

/** Company page body (spec v7b §3). Server component. */
export default function CompanyPage({
  stats,
  detail,
  cloud,
}: {
  stats: Stats;
  detail: CompanyDetail;
  cloud: CloudWord[];
}) {
  const open = stats.phase === "vote";
  const cta = open ? (
    <Link
      className="btn btn--red"
      href={`/vote?pick=${encodeURIComponent(detail.domain)}`}
    >
      投給這家公司
      <Icon icon={ArrowRight} />
    </Link>
  ) : null;
  return (
    <SiteChrome stats={stats}>
      <ReactionProvider open={open}>
        <div className="pagehero">
          <div className="wrap cohero">
            <div>
              <span className="chip">Company</span>
              <h1>{detail.display_name}</h1>
              <p className="cohero__meta">
                <a
                  href={`https://${detail.domain}`}
                  target="_blank"
                  rel="nofollow noopener"
                >
                  {detail.domain}
                  <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                </a>
                {detail.aliases.length > 0 ? (
                  <span>也稱為：{detail.aliases.join(" · ")}</span>
                ) : null}
              </p>
            </div>
            {cta}
          </div>
        </div>

        <div className="wrap">
          <div className="sched sched--flat" aria-label="公司概況">
            <div className="sc">
              <Icon icon={Trophy} />
              <span className="k">目前排名</span>
              <span className="v num">#{detail.rank}</span>
            </div>
            <div className="sc">
              <Icon icon={Vote} />
              <span className="k">票數</span>
              <span className="v num">{nf.format(detail.votes)}</span>
            </div>
            <div className="sc">
              <Icon icon={MessageSquareText} />
              <span className="k">理由</span>
              <span className="v num">{nf.format(detail.reasons_count)}</span>
            </div>
          </div>

          <Band id="why" chip="Why People Vote" title="大家為什麼投它">
            {detail.reasons.length === 0 ? (
              <p className="empty">還沒有人寫下理由。</p>
            ) : (
              <div className="rgrid">
                {detail.reasons.map((r) => (
                  <ReasonCard
                    key={r.pick_id}
                    pickId={r.pick_id}
                    domain={detail.domain}
                    reason={r.reason}
                    likes={r.likes}
                    dislikes={r.dislikes}
                  />
                ))}
              </div>
            )}
          </Band>

          <Band id="keywords" chip="Keywords" title="關鍵字">
            <WordCloud
              words={cloud}
              label={`${detail.display_name} 的投票理由關鍵字`}
              empty="有人投票並寫下理由後，這裡會出現關鍵字。"
            />
            {cta ? <div className="howcta">{cta}</div> : null}
          </Band>
        </div>
      </ReactionProvider>
    </SiteChrome>
  );
}
