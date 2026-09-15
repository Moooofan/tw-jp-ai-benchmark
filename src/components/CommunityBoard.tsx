"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  MessageSquareText,
  Minus,
  Vote,
} from "lucide-react";
import { dateRange } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase-browser";
import { EMPTY_VOTE_BOARD, type Movement, type VoteBoard } from "@/lib/types";
import Favicon from "./Favicon";
import Icon from "./Icon";
import { ReasonCard } from "./Reactions";

const REFRESH_MS = 60_000;

const BoardCtx = createContext<VoteBoard>(EMPTY_VOTE_BOARD);

/** Holds `vote_board()` for the page and refreshes it every 60 s. */
export function BoardProvider({
  initial,
  children,
}: {
  initial: VoteBoard;
  children: ReactNode;
}) {
  const [board, setBoard] = useState(initial);
  useEffect(() => {
    const supabase = getBrowserClient();
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const { data } = await supabase.rpc("vote_board");
      if (data) setBoard({ ...EMPTY_VOTE_BOARD, ...(data as VoteBoard) });
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, []);
  return <BoardCtx.Provider value={board}>{children}</BoardCtx.Provider>;
}

const nf = new Intl.NumberFormat("en-US");

/** 投票期間 · 總票數 · 總理由數 (spec v7b §1.3, §4). */
export function VoteStatStrip({
  voteOpen,
  voteClose,
  closed,
}: {
  voteOpen: string | null;
  voteClose: string | null;
  closed: boolean;
}) {
  const board = useContext(BoardCtx);
  return (
    <div className="sched" aria-label="投票概況">
      <div className={closed ? "sc ended" : "sc now"}>
        <Icon icon={CalendarDays} />
        <span className="k">投票期間</span>
        <span className="v">{dateRange(voteOpen, voteClose)}</span>
      </div>
      <div className="sc">
        <Icon icon={Vote} />
        <span className="k">總票數</span>
        <span className="v num">{nf.format(board.total_votes)}</span>
      </div>
      <div className="sc">
        <Icon icon={MessageSquareText} />
        <span className="k">總理由數</span>
        <span className="v num">{nf.format(board.total_reasons)}</span>
      </div>
    </div>
  );
}

function MovementMark({ m }: { m: Movement }) {
  if (m === "new") return <span className="mv mv--new">NEW</span>;
  const map = {
    up: { icon: ArrowUp, label: "排名上升" },
    down: { icon: ArrowDown, label: "排名下降" },
    same: { icon: Minus, label: "排名不變" },
  } as const;
  const { icon: Glyph, label } = map[m];
  return (
    <span className={`mv mv--${m}`} title={label}>
      <Glyph size={16} strokeWidth={2} aria-hidden="true" />
      <span className="sr">{label}</span>
    </span>
  );
}

/** 01 排行榜: top 30 with movement and a bar relative to the leader. */
export function Leaderboard() {
  const { leaderboard } = useContext(BoardCtx);
  if (leaderboard.length === 0) {
    return <p className="empty">候選公司確認後，這裡會出現排行榜。</p>;
  }
  const lead = Math.max(1, ...leaderboard.map((r) => r.votes));
  return (
    <div className="lb">
      <div className="lb__head" aria-hidden="true">
        <span>排名</span>
        <span />
        <span>公司</span>
        <span className="num">票數</span>
        <span className="num">理由</span>
      </div>
      <ol className="lb__rows">
        {leaderboard.map((r) => (
          <li key={r.domain} className={r.rank <= 3 ? "lb__row top" : "lb__row"}>
            <span className="lb__rank">{r.rank}</span>
            <MovementMark m={r.movement} />
            <div className="lb__co">
              <Favicon domain={r.domain} name={r.display_name} size={28} />
              <div className="lb__name">
                <Link href={`/company/${encodeURIComponent(r.domain)}`}>
                  {r.display_name}
                </Link>
                <span className="lb__bar" aria-hidden="true">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, (r.votes / lead) * 100))}%`,
                    }}
                  />
                </span>
                <small className="lb__sub">{r.reasons} 則理由</small>
              </div>
            </div>
            <span className="lb__votes num">
              {nf.format(r.votes)}
              <small> 票</small>
            </span>
            <span className="lb__reasons num">{nf.format(r.reasons)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** 02 熱門理由: 熱門 / 最新 tabs of reason cards. */
export function ReasonTabs() {
  const board = useContext(BoardCtx);
  const [tab, setTab] = useState<"hot" | "latest">("hot");
  const list = tab === "hot" ? board.hot_reasons : board.latest_reasons;
  return (
    <>
      <div className="tabs" role="tablist" aria-label="理由排序">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "hot"}
          className={tab === "hot" ? "on" : undefined}
          onClick={() => setTab("hot")}
        >
          熱門
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "latest"}
          className={tab === "latest" ? "on" : undefined}
          onClick={() => setTab("latest")}
        >
          最新
        </button>
      </div>
      {list.length === 0 ? (
        <p className="empty">投票開始後，大家寫下的理由會出現在這裡。</p>
      ) : (
        <div className="rgrid">
          {list.map((r) => (
            <ReasonCard
              key={r.pick_id}
              pickId={r.pick_id}
              domain={r.domain}
              displayName={r.display_name}
              reason={r.reason}
              likes={r.likes}
              dislikes={r.dislikes}
            />
          ))}
        </div>
      )}
    </>
  );
}
