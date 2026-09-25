"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CandidateDetail, Stats } from "@/lib/types";
import { CandidateCard, SupportProvider } from "./CandidateSupport";
import Icon from "./Icon";
import ShareRow from "./ShareRow";
import SiteChrome, { DISCLAIMER } from "./SiteChrome";

/**
 * `/candidates/[domain]` (spec v8 §6): one candidate's share page. A pooled
 * company keeps its own `/company/[domain]` page; this one exists so a pending
 * case can collect its 11 supports.
 */
export default function CandidateShare({
  stats,
  candidate,
}: {
  stats: Stats;
  candidate: CandidateDetail;
}) {
  const open = stats.phase === "vote";
  const path = `/candidates/${encodeURIComponent(candidate.domain)}`;
  return (
    <SiteChrome stats={stats}>
      <SupportProvider open={open}>
        <div className="pagehero">
          <div className="wrap">
            <span className="chip">
              {candidate.in_pool ? "正式候選" : "待確認遺珠"}
            </span>
            <h1>{candidate.display_name}</h1>
            <p>
              {candidate.in_pool
                ? "這個案例已經進入正式投票池，和所有正式候選使用相同規則。"
                : "取得第 11 個不同 email 的支持後，它才會正式進入投票池。"}
            </p>
          </div>
        </div>

        <div className="wrap">
          <div className="split">
            <div className="flow">
              <CandidateCard candidate={candidate} linked={false} />
              <div className="formcard">
                <h3>邀請更多人支持這個案例</h3>
                <p>
                  你可以分享候選連結，邀請更多人支持它進入正式投票。
                </p>
                <ShareRow
                  text={`${candidate.display_name}：一起讓這個案例進入 TAIWAN → JAPAN 2026 的正式投票。`}
                  path={path}
                />
              </div>
            </div>

            <aside className="side">
              <span className="k">入池門檻</span>
              <span className="v">11 個有效支持</span>
              <hr />
              <p className="fine">
                過去資格支持不轉成 11 票；正式票以 1 票起算。
              </p>
              <hr />
              {candidate.in_pool && open ? (
                <Link
                  className="btn btn--line"
                  href={`/vote?pick=${encodeURIComponent(candidate.domain)}`}
                >
                  去投給它
                  <Icon icon={ArrowRight} />
                </Link>
              ) : (
                <Link className="btn btn--line" href="/candidates">
                  看所有待確認遺珠
                </Link>
              )}
              <p className="fine">{DISCLAIMER}</p>
            </aside>
          </div>
        </div>
      </SupportProvider>
    </SiteChrome>
  );
}
