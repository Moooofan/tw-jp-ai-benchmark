"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MessageSquareText, Vote } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase-browser";
import type { CompanyDetail } from "@/lib/types";
import { wordCloud, type CloudWord } from "@/lib/wordcloud";
import Band from "./Band";
import Icon from "./Icon";
import { DISLIKE_NOTE, ReasonCard } from "./Reactions";
import { LockedNote, useVotedToday } from "./VoteGate";
import WordCloud from "./WordCloud";

const nf = new Intl.NumberFormat("en-US");

type Data = { detail: CompanyDetail; cloud: CloudWord[] };

/**
 * Votes, reasons and keywords of one company. While voting is open
 * (`lockable`) they are fetched only after this browser has voted today, so
 * neither the HTML nor the RSC payload carries them before that.
 */
export default function CompanyCommunity({
  domain,
  displayName,
  initial,
  lockable,
  voteHref,
  cta,
}: {
  domain: string;
  displayName: string;
  initial: Data | null;
  lockable: boolean;
  voteHref: string;
  cta: ReactNode;
}) {
  const gate = useVotedToday(lockable);
  const [data, setData] = useState<Data | null>(initial);

  useEffect(() => {
    if (gate !== "unlocked" || !lockable) return;
    const supabase = getBrowserClient();
    let live = true;
    void Promise.all([
      supabase.rpc("company_detail", { p_domain: domain }),
      supabase.rpc("reason_corpus", { p_domain: domain }),
    ]).then(([d, c]) => {
      if (!live || !d.data) return;
      let cloud: CloudWord[] = [];
      try {
        cloud = wordCloud((c.data as string[] | null) ?? []);
      } catch {
        /* old Intl build: no keywords, page still works */
      }
      setData({ detail: d.data as CompanyDetail, cloud });
    });
    return () => {
      live = false;
    };
  }, [gate, lockable, domain]);

  if (gate !== "unlocked") {
    return (
      <Band id="why" chip="Why People Vote" title="大家為什麼投它">
        <LockedNote voteHref={voteHref} />
      </Band>
    );
  }
  if (!data) return <p className="empty">載入中…</p>;
  const { detail, cloud } = data;

  return (
    <>
      {/* spec v8 §5: no rank numerals — this is not a final ranking. */}
      <div className="sched sched--flat sched--two" aria-label="公司概況">
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
        <p className="note">
          每一則理由每滿 10 個有效按讚，替該公司增加 1 票。{DISLIKE_NOTE}
        </p>
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
          label={`${displayName} 的投票理由關鍵字`}
          empty="有人投票並寫下理由後，這裡會出現關鍵字。"
        />
        {cta ? <div className="howcta">{cta}</div> : null}
      </Band>
    </>
  );
}
