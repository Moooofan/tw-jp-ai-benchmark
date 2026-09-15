"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Info, SquareCheckBig } from "lucide-react";
import { dateRange, monthDay } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { MyState, PublicFinalist, Stats } from "@/lib/types";
import Icon from "./Icon";
import { useParticipantEmail } from "./ParticipantEmail";
import ShareRow from "./ShareRow";
import SiteChrome, { DISCLAIMER, type ChromeStory } from "./SiteChrome";

const PICKS = 3;

export default function VoteClient({
  stats,
  finalists,
  chrome,
}: {
  chrome?: ChromeStory;
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
      <SiteChrome stats={stats} story={chrome}>
        <div className="pagehero">
          <div className="wrap">
            <span className="chip">Vote</span>
            <h1>社群正式投票</h1>
            <p>從 Community Shortlist 選出最多三家公司</p>
          </div>
        </div>

        <div className="wrap">
          <div className="split" id="ballot">
            {stats.phase !== "vote" ? (
              <div className="formcard">
                <h3>{notice.title}</h3>
                <p>{notice.body}</p>
                <Link className="btn btn--ghost" href="/">
                  回到首頁
                </Link>
              </div>
            ) : (
              <div>
                {finalists.length === 0 ? (
                  <div className="formcard">
                    <p className="empty">Shortlist 尚未公布。</p>
                  </div>
                ) : (
                  <div className="ballot">
                    {finalists.map((f) => {
                      const on = picks.includes(f.id);
                      return (
                        <article className={on ? "card fin on" : "card fin"} key={f.id}>
                          <h3>{f.company}</h3>
                          {f.name_en ? <span className="en">{f.name_en}</span> : null}
                          {f.one_liner ? <p className="one">{f.one_liner}</p> : null}
                          {f.industry ? <span className="ind">{f.industry}</span> : null}
                          {f.jp_info ? <p className="jp">{f.jp_info}</p> : null}
                          <div className="cardfoot">
                            <button
                              type="button"
                              className={on ? "btn btn--sm btn--done" : "btn btn--sm btn--brand"}
                              aria-pressed={on}
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
                        </article>
                      );
                    })}
                  </div>
                )}

                {used >= PICKS ? (
                  <div className="thanks" style={{ marginTop: 28 }}>
                    <p className="note" style={{ margin: 0 }}>
                      已完成投票。結果預計於 {stats.results_label}公布。
                    </p>
                    <ShareRow />
                  </div>
                ) : null}

                <p className="note">
                  投票期間不公開票數、排名或目前領先狀態。結果將於公布日一次揭曉。
                </p>
              </div>
            )}

            <aside className="side">
              <span className="k">投票期間</span>
              <span className="v">{dateRange(stats.vote_open, stats.vote_close)}</span>
              <hr />
              <ul className="checks">
                <li>
                  <Icon icon={SquareCheckBig} />
                  每個 Email 最多投三家公司
                </li>
                <li>
                  <Icon icon={Info} />
                  投票期間不公開票數、排名或目前領先狀態。
                </li>
              </ul>
              {stats.phase === "vote" ? (
                <>
                  <hr />
                  <span className="pips" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className={i < used ? "pip on" : "pip"} />
                    ))}
                  </span>
                  <p className="remain" aria-live="polite">
                    {msg ?? `還有 ${Math.max(0, PICKS - used)} 票`}
                  </p>
                </>
              ) : null}
              <hr />
              <p className="fine">{DISCLAIMER}</p>
            </aside>
          </div>
        </div>
      </SiteChrome>

      {identity.modal}
    </>
  );
}
