"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { dateRange, monthDay } from "@/lib/format";
import type { PublicPost, Stats } from "@/lib/types";
import { useParticipantEmail } from "./ParticipantEmail";
import Letters from "./Letters";
import NominateForm from "./NominateForm";
import Section from "./SectionGrid";
import ShareRow from "./ShareRow";
import SiteChrome, { DISCLAIMER } from "./SiteChrome";

const PAGE = 12;
const QUOTA = 3;
const QUOTA_KEY = "benchmark:nominated";

/**
 * What this browser has already nominated under a given email. The database is
 * still the authority (the `nominate` RPC enforces the 3-company cap per
 * email); this only decides whether to offer 再提名一家.
 */
function remember(email: string, company: string): number {
  const key = `${QUOTA_KEY}:${email.trim().toLowerCase()}`;
  try {
    const raw = window.localStorage.getItem(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const k = company.trim().toLowerCase();
    if (!list.includes(k)) list.push(k);
    window.localStorage.setItem(key, JSON.stringify(list));
    return list.length;
  } catch {
    return 1;
  }
}

export default function NominateClient({
  stats,
  posts,
}: {
  stats: Stats;
  posts: PublicPost[];
}) {
  const router = useRouter();
  const identity = useParticipantEmail();
  const [done, setDone] = useState(false);
  const [used, setUsed] = useState(1);
  const [shown, setShown] = useState(PAGE);

  const sorted = useMemo(
    () =>
      posts
        .slice()
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [posts],
  );

  const notice =
    stats.phase === "pre"
      ? {
          title: "提名尚未開放",
          body: `提名將於 ${monthDay(stats.nominate_open)} 開放。`,
        }
      : stats.phase === "vote"
        ? { title: "提名已結束", body: "提名期間已結束。" }
        : {
            title: "投票已結束",
            body: `投票已結束。結果預計於 ${stats.results_label} 公布。`,
          };

  return (
    <>
      <SiteChrome stats={stats}>
        {stats.phase !== "nominate" ? (
          <Section title={notice.title}>
            <p className="empty">{notice.body}</p>
            <p className="note">
              <Link className="tbtn" href="/">
                回到首頁
              </Link>
            </p>
          </Section>
        ) : (
          <>
            <Section
              id="form"
              title="提名台灣新創"
              sticky
              narrow
              lede="每人最多提名三家公司。"
              aside={
                <>
                  <ul className="checklist">
                    <li>公司中英文名稱</li>
                    <li>官方網址</li>
                    <li>60–200 字的提名理由</li>
                  </ul>
                  <p className="sec__lede">
                    提名期間{" "}
                    {dateRange(stats.nominate_open, stats.nominate_close)}
                  </p>
                  <p className="sec__lede">{DISCLAIMER}</p>
                </>
              }
            >
              {done ? (
                <div className="thanks">
                  <h3>感謝參與。</h3>
                  <p>結果預計於 {stats.results_label}公布。</p>
                  <ShareRow />
                  <div className="after">
                    {used < QUOTA ? (
                      <button
                        type="button"
                        className="tbtn"
                        onClick={() => setDone(false)}
                      >
                        再提名一家
                      </button>
                    ) : null}
                    <Link className="tbtn" href="/">
                      回到首頁
                    </Link>
                  </div>
                </div>
              ) : (
                <NominateForm
                  identity={identity}
                  onDone={(company, email) => {
                    setUsed(remember(email, company));
                    setDone(true);
                    router.refresh();
                  }}
                />
              )}
            </Section>

            <Section id="recent" title="社群最近提名" narrow>
              {sorted.length === 0 ? (
                <p className="empty">目前還沒有公開的提名。</p>
              ) : (
                <Letters posts={sorted.slice(0, shown)} identity={identity} />
              )}
              {sorted.length > shown ? (
                <div className="more">
                  <button
                    className="cta"
                    type="button"
                    onClick={() => setShown((s) => s + PAGE)}
                  >
                    載入更多
                  </button>
                </div>
              ) : null}
              <p className="note">
                提名經主辦團隊清理與資格檢查後，才會成為第二階段的正式選項。第一階段不公開即時排名或逐名票數。
              </p>
            </Section>
          </>
        )}
      </SiteChrome>

      {identity.modal}
    </>
  );
}
