"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase-browser";
import type { MyVoteState } from "@/lib/types";
import { markVotedToday, savedEmail, votedTodayLocal } from "@/lib/voted";
import Icon from "./Icon";

/**
 * `checking` renders exactly like `locked` (that is also what the server
 * renders), so nothing about the community view ever reaches the HTML.
 */
export type GateState = "checking" | "locked" | "unlocked";

/**
 * Anti-herding gate (2026-09-28): while voting is open, the community view
 * unlocks only once this browser has voted today — a successful cast_ballot
 * here (localStorage), or `my_vote_state(saved email).voted_today`.
 * `lockable = false` (voting closed / results) unlocks immediately.
 */
export function useVotedToday(lockable: boolean): GateState {
  const [state, setState] = useState<GateState>(
    lockable ? "checking" : "unlocked",
  );
  useEffect(() => {
    if (!lockable) return;
    if (votedTodayLocal()) {
      setState("unlocked");
      return;
    }
    const email = savedEmail();
    if (!email) {
      setState("locked");
      return;
    }
    let live = true;
    getBrowserClient()
      .rpc("my_vote_state", { p_email: email })
      .then(
        ({ data }) => {
          if (!live) return;
          if ((data as MyVoteState | null)?.voted_today) {
            markVotedToday();
            setState("unlocked");
          } else {
            setState("locked");
          }
        },
        () => {
          if (live) setState("locked");
        },
      );
    return () => {
      live = false;
    };
  }, [lockable]);
  return state;
}

export const LOCK_TEXT =
  "為了讓每一票都是獨立判斷，投票後才會看到社群的排序與理由。";

/** Calm placeholder where the community view will appear after voting. */
export function LockedNote({ voteHref }: { voteHref: string }) {
  return (
    <div className="lockbox">
      <p>{LOCK_TEXT}</p>
      <Link className="btn btn--red" href={voteHref}>
        開始投票
        <Icon icon={ArrowRight} />
      </Link>
    </div>
  );
}
