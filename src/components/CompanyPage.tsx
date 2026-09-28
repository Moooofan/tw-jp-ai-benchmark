import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { isNameKey } from "@/lib/format";
import type { CloudWord } from "@/lib/wordcloud";
import type { CompanyDetail, Stats } from "@/lib/types";
import CompanyCommunity from "./CompanyCommunity";
import Icon from "./Icon";
import { ReactionProvider } from "./Reactions";
import SiteChrome from "./SiteChrome";

/**
 * Company page body (spec v7b §3). Server component. Anti-herding
 * (2026-09-28): while voting is open (`lockable`) the server ships only the
 * name, sector and vote CTA; votes and reasons load in the browser once this
 * visitor has voted today (CompanyCommunity).
 */
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
  const lockable = open;
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
                {isNameKey(detail.domain) ? (
                  <span>官網待確認</span>
                ) : (
                  <a
                    href={`https://${detail.domain}`}
                    target="_blank"
                    rel="nofollow noopener"
                  >
                    {detail.domain}
                    <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                  </a>
                )}
                {detail.sector ? <span className="rb__tag">{detail.sector}</span> : null}
                {detail.aliases.length > 0 ? (
                  <span>也稱為：{detail.aliases.join(" · ")}</span>
                ) : null}
              </p>
            </div>
            {cta}
          </div>
        </div>

        <div className="wrap">
          <CompanyCommunity
            domain={detail.domain}
            displayName={detail.display_name}
            initial={lockable ? null : { detail, cloud }}
            lockable={lockable}
            voteHref={`/vote?pick=${encodeURIComponent(detail.domain)}`}
            cta={cta}
          />
        </div>
      </ReactionProvider>
    </SiteChrome>
  );
}
