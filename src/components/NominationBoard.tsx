"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Clock,
  Flame,
  Minus,
} from "lucide-react";
import { hhmm, isNameKey, minutesAgo } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase-browser";
import {
  EMPTY_BOARD,
  type Board,
  type Movement,
  type Stats,
} from "@/lib/types";
import Favicon from "./Favicon";
import Icon from "./Icon";
import { NominateCta } from "./SiteChrome";

/** Set by /nominate after a successful nomination; makes the board re-read live. */
export const JUST_NOMINATED_KEY = "tj:nominated";

const pad2 = (n: number) => String(n).padStart(2, "0");

function MoveMark({ m }: { m: Movement }) {
  if (m === "new") return <span className="mv mv--new">NEW</span>;
  const label =
    m === "up" ? "排序上升" : m === "down" ? "排序下降" : "排序不變";
  return (
    <span className={`mv mv--${m}`} title={label}>
      {m === "up" ? (
        <ArrowUp size={16} strokeWidth={2} aria-hidden="true" />
      ) : m === "down" ? (
        <ArrowDown size={16} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Minus size={16} strokeWidth={2} aria-hidden="true" />
      )}
      <span className="sr">{label}</span>
    </span>
  );
}

const BoardContext = createContext<{ board: Board; now: number | null }>({
  board: EMPTY_BOARD,
  now: null,
});

/**
 * Holds the board for the whole home page (stat strip + 02 候選名單). Server
 * rendered from `board()`; re-read in the browser only right after this
 * visitor nominated, so they see their company without waiting for ISR.
 */
export function BoardProvider({
  board: initial,
  children,
}: {
  board: Board;
  children: ReactNode;
}) {
  const [board, setBoard] = useState<Board>(initial);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => setBoard(initial), [initial]);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    let flagged = false;
    try {
      flagged = window.sessionStorage.getItem(JUST_NOMINATED_KEY) !== null;
      window.sessionStorage.removeItem(JUST_NOMINATED_KEY);
    } catch {
      /* storage unavailable */
    }
    if (flagged) {
      void getBrowserClient()
        .rpc("board")
        .then(({ data }) => {
          if (data) setBoard({ ...EMPTY_BOARD, ...(data as Board) });
        });
    }
    return () => clearInterval(t);
  }, []);

  return (
    <BoardContext.Provider value={{ board, now }}>
      {children}
    </BoardContext.Provider>
  );
}

export function BoardTotal() {
  return <>{useContext(BoardContext).board.total_companies}</>;
}

export function BoardUpdated() {
  return <>{hhmm(useContext(BoardContext).board.updated_at) || "—"}</>;
}

/** 02 候選名單 (spec v6 §3.5): recent / hot / total, side by side. */
export default function NominationBoard({ stats }: { stats: Stats }) {
  const { board, now } = useContext(BoardContext);

  const ref =
    now ?? (board.updated_at ? new Date(board.updated_at).getTime() : 0);

  if (board.total_companies === 0) {
    return (
      <div className="boardempty">
        <p>還沒有人提名。第一個提名的人，會讓這份名單開始長出來。</p>
        <NominateCta stats={stats}>
          <Icon icon={ArrowRight} />
        </NominateCta>
      </div>
    );
  }

  return (
    <div className="boardgrid">
      <article className="bcard">
        <header>
          <span className="k">RECENT</span>
          <h3>
            <Icon icon={Clock} />
            最近新增
          </h3>
        </header>
        <ol className="rows">
          {board.recent.map((c) => (
            <li key={c.domain}>
              <Favicon domain={c.domain} name={c.display_name} />
              <span className="co">
                <b>{c.display_name}</b>
                <small>{isNameKey(c.domain) ? "官網待確認" : c.domain}</small>
              </span>
              <span className="ago">
                {minutesAgo(c.first_nominated_at, ref)}
              </span>
            </li>
          ))}
        </ol>
      </article>

      <article className="bcard">
        <header>
          <span className="k">TRENDING</span>
          <h3>
            <Icon icon={Flame} />
            熱門關注
          </h3>
        </header>
        <ol className="rows rows--hot">
          {board.hot.map((c, i) => (
            <li key={c.domain}>
              <span className="rk">{pad2(i + 1)}</span>
              <Favicon domain={c.domain} name={c.display_name} />
              <span className="co">
                <b>{c.display_name}</b>
                <span className="heat">
                  <span className="heat__k">關注度</span>
                  <span className="heat__bar">
                    <i style={{ width: `${Math.round(c.share * 100)}%` }} />
                  </span>
                </span>
              </span>
              <MoveMark m={c.movement} />
            </li>
          ))}
        </ol>
        <p className="bnote">排序每小時更新一次。</p>
      </article>

      <article className="bcard bcard--total">
        <span className="k">TOTAL</span>
        <h3>總候選公司數</h3>
        <span className="total">
          {board.total_companies}
          <small>家</small>
        </span>
        <NominateCta stats={stats} className="btn btn--red btn--sm">
          <Icon icon={ArrowRight} />
        </NominateCta>
      </article>
    </div>
  );
}
