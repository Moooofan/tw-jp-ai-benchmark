"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { SquareCheckBig } from "lucide-react";
import { dateRange, monthDay } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { MyState, PublicFinalist, Stats } from "@/lib/types";
import Icon from "./Icon";
import { useParticipantEmail } from "./ParticipantEmail";
import Section from "./SectionGrid";
import ShareRow from "./ShareRow";
import SiteChrome, { DISCLAIMER } from "./SiteChrome";

const PICKS = 3;

export default function VoteClient({
  stats,
  finalists,
}: {
  stats: Stats;
  finalists: PublicFinalist[];
}) {
  const supabase = getBrowserClient();
  const identity = useParticipantEmail();
  const [picks, setPicks] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    if (!identity.hasEmail) {
      setPicks([]);
      return;
    }
    const { data } = await supabase.rpc("my_state", { p_email: identity.email });
    if (data) setPicks((data as Partial<MyState>).picks ?? []);
  }, [identity.hasEmail, identity.email, supabase]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const used = picks.length;

  function toggle(f: PublicFinalist) {
    identity.require(async (email) => {
      setMsg(null);
      if (!picks.includes(f.id) && used >= PICKS) {
        setMsg("每個 Email 最多投三家，請先取消一家。");
        return;
      }
      const { data, error } = await supabase.rpc("cast_final_vote", {
        p_finalist: f.id,
        p_email: email,
      });
      if (error) {
        setMsg(errText(error));
        return;
      }
      setPicks((data as string[] | null) ?? []);
    });
  }

  const notice =
    stats.phase === "pre" || stats.phase === "nominate"
      ? {
          title: "投票尚未開放",
          body: `投票將於 ${monthDay(stats.vote_open)} 開放。`,
        }
      : {
          title: "投票已結束",
          body: `投票已結束。結果預計於 ${stats.results_label} 公布。`,
        };

  return (
    <>
      <SiteChrome stats={stats}>
        {stats.phase !== "vote" ? (
          <Section title={notice.title}>
            <p className="empty">{notice.body}</p>
            <p className="note">
              <Link className="tbtn" href="/">
                回到首頁
              </Link>
            </p>
          </Section>
        ) : (
          <Section
            id="ballot"
            title="社群正式投票"
            sticky
            aside={
              <>
                <p className="sec__lede irow">
                  <Icon icon={SquareCheckBig} />
                  <span>每個 Email 最多投三家公司</span>
                </p>
                <p className="picks">
                  <span className="pips">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={i < used ? "pip on" : "pip"} />
                    ))}
                  </span>
                  <span>{msg ?? `還有 ${Math.max(0, PICKS - used)} 票`}</span>
                </p>
              </>
            }
          >
            <p className="intro">
              投票期間 {dateRange(stats.vote_open, stats.vote_close)}
              <br />
              {DISCLAIMER}
            </p>
            {finalists.length === 0 ? (
              <p className="empty">Shortlist 尚未公布。</p>
            ) : (
              <div className="cards">
                {finalists.map((f) => {
                  const on = picks.includes(f.id);
                  return (
                    <div className="card" key={f.id}>
                      <h3>{f.company}</h3>
                      {f.name_en ? <p className="en">{f.name_en}</p> : null}
                      {f.one_liner ? <p className="one">{f.one_liner}</p> : null}
                      {f.industry ? (
                        <span className="tag">{f.industry}</span>
                      ) : null}
                      {f.jp_info ? <p className="jp">{f.jp_info}</p> : null}
                      <div className="foot">
                        <button
                          type="button"
                          className={on ? "tbtn tbtn--done" : "tbtn"}
                          onClick={() => toggle(f)}
                        >
                          {on ? "已投" : "投票"}
                        </button>
                        {f.url ? (
                          <a href={f.url} target="_blank" rel="noopener noreferrer">
                            官方網址
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {used >= PICKS ? (
              <div className="thanks">
                <p className="note">
                  已完成投票。結果預計於 {stats.results_label}公布。
                </p>
                <ShareRow />
              </div>
            ) : null}

            <p className="note">
              投票期間不公開票數、排名或目前領先狀態。結果將於公布日一次揭曉。
            </p>
          </Section>
        )}
      </SiteChrome>

      {identity.modal}
    </>
  );
}
