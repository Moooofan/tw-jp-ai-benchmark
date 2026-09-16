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

/**
 * 社群共鳴與趨勢 (memo v4.0 p.3: Community Resonance、趨勢). Reactions on the
 * reasons, and how many ballots and reasons arrived each day.
 */
export function ResonanceAndTrend() {
  const board = useContext(BoardCtx);
  const likes = board.total_likes;
  const dislikes = board.total_dislikes;
  const all = likes + dislikes;
  const share = all > 0 ? Math.round((likes / all) * 100) : 0;
  const net = likes - dislikes;
  const top = board.resonance[0];
  const peak = board.trend.reduce((m, d) => Math.max(m, d.ballots, d.reasons), 0);

  if (all === 0 && board.trend.length === 0) {
    return <p className="empty">投票開始後，這裡會顯示大家的推噓與每日趨勢。</p>;
  }

  return (
    <div className="reso">
      <div className="reso__bar" aria-hidden="true">
        <i className="reso__up" style={{ width: `${share}%` }} />
        <i className="reso__down" style={{ width: `${100 - share}%` }} />
      </div>
      <p className="reso__k">
        全站推 <b className="num">{nf.format(likes)}</b> · 噓{" "}
        <b className="num">{nf.format(dislikes)}</b> · 淨值{" "}
        <b className="num">
          {net > 0 ? "+" : ""}
          {nf.format(net)}
        </b>
        （每淨 10 個影響該公司 1 票）
      </p>

      {board.resonance.length > 0 ? (
        <div className="resolist">
          <h3 className="resoh">哪些公司最有共鳴</h3>
          <ol>
            {board.resonance.map((c) => {
              const t = c.likes + c.dislikes;
              const up = t > 0 ? Math.round((c.likes / t) * 100) : 0;
              return (
                <li key={c.domain}>
                  <span className="resolist__co">{c.display_name}</span>
                  <span className="resolist__bar" aria-hidden="true">
                    <i className="reso__up" style={{ width: `${up}%` }} />
                    <i className="reso__down" style={{ width: `${100 - up}%` }} />
                  </span>
                  <span className="resolist__n num">
                    推 {nf.format(c.likes)} · 噓 {nf.format(c.dislikes)} · 淨{" "}
                    {c.net > 0 ? "+" : ""}
                    {nf.format(c.net)}
                  </span>
                </li>
              );
            })}
          </ol>
          {top ? (
            <p className="bnote">
              目前最有共鳴的是 {top.display_name}，淨值 {top.net > 0 ? "+" : ""}
              {nf.format(top.net)}，換算約 {Math.trunc(top.net / 10)} 票。
            </p>
          ) : null}
        </div>
      ) : null}

      {board.divisive.length > 0 ? (
        <div className="resolist">
          <h3 className="resoh">意見最分歧的理由</h3>
          <ul className="divis">
            {board.divisive.map((r) => (
              <li key={r.pick_id}>
                <span className="divis__co">{r.display_name}</span>
                <span className="divis__r">{r.reason}</span>
                <span className="divis__n num">
                  推 {nf.format(r.likes)} · 噓 {nf.format(r.dislikes)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {board.trend.length > 0 ? (
        <div className="trend">
          {board.trend.map((d) => (
            <div className="trend__day" key={d.day}>
              <span className="trend__bars">
                <i
                  className="trend__b trend__b--v"
                  style={{ height: `${peak ? (d.ballots / peak) * 100 : 0}%` }}
                  title={`${d.day}：${d.ballots} 票`}
                />
                <i
                  className="trend__b trend__b--r"
                  style={{ height: `${peak ? (d.reasons / peak) * 100 : 0}%` }}
                  title={`${d.day}：${d.reasons} 則理由`}
                />
              </span>
              <span className="trend__d">{d.day.slice(5).replace("-", "/")}</span>
            </div>
          ))}
          <p className="trend__legend">
            <span className="trend__key trend__key--v" /> 每日票數
            <span className="trend__key trend__key--r" /> 每日理由數
          </p>
        </div>
      ) : null}
    </div>
  );
}
