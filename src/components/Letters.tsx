"use client";

import { useCallback, useEffect, useState } from "react";
import { monthDay } from "@/lib/format";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { MyState, PublicPost } from "@/lib/types";
import type { useParticipantEmail } from "./ParticipantEmail";

/**
 * The "letters" list of recent nominations. Used twice: six entries on `/`,
 * the full paged list on `/nominate#recent`. 附議 / 存疑 write `votes` through
 * the unchanged `cast_vote` RPC and only ever show the caller's own state.
 */
export default function Letters({
  posts,
  identity,
}: {
  posts: PublicPost[];
  identity: ReturnType<typeof useParticipantEmail>;
}) {
  const supabase = getBrowserClient();
  const [votes, setVotes] = useState<MyState["votes"]>({});

  const loadMine = useCallback(async () => {
    if (!identity.hasEmail) {
      setVotes({});
      return;
    }
    const { data } = await supabase.rpc("my_state", { p_email: identity.email });
    if (data) setVotes((data as Partial<MyState>).votes ?? {});
  }, [identity.hasEmail, identity.email, supabase]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  function endorse(post: PublicPost, dir: 1 | -1) {
    identity.require(async (email) => {
      const prev = votes[post.id] ?? 0;
      const next = prev === dir ? 0 : dir;
      setVotes((v) => ({ ...v, [post.id]: next }));
      const { error } = await supabase.rpc("cast_vote", {
        p_post: post.id,
        p_dir: dir,
        p_email: email,
      });
      if (error) {
        setVotes((v) => ({ ...v, [post.id]: prev }));
        window.alert(errText(error));
      }
    });
  }

  return (
    <div>
      {posts.map((p) => (
        <article className="letter" key={p.id}>
          <div>
            <p className="who">
              <b>{p.company}</b>
              {p.company_en ? <span className="en">{p.company_en}</span> : null}
              {" · 投書："}
              {p.masked_email}
              {" · "}
              {monthDay(p.created_at)}
            </p>
            <p className="body">{p.reason}</p>
          </div>
          <div className="endorse">
            <button
              type="button"
              className={votes[p.id] === 1 ? "on" : ""}
              onClick={() => endorse(p, 1)}
            >
              附議
            </button>
            <button
              type="button"
              className={votes[p.id] === -1 ? "doubt on" : "doubt"}
              onClick={() => endorse(p, -1)}
            >
              存疑
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
