"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  CalendarDays,
  Flame,
} from "lucide-react";
import { dateRange, hhmm } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase-browser";
import {
  EMPTY_BOARD,
  type Board,
  type Stats,
} from "@/lib/types";
import BoardPie from "./BoardPie";
import NameCloud from "./NameCloud";
import Favicon from "./Favicon";
import Icon from "./Icon";
import { NominateCta } from "./SiteChrome";
export const JUST_NOMINATED_KEY = "benchmark:just-nominated";

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
    // Live ranking (owner, 2026-09-16): re-read the board every 20 s.
    const poll = setInterval(() => {
      void getBrowserClient()
        .rpc("board")
        .then(({ data }) => {
          if (data) setBoard({ ...EMPTY_BOARD, ...(data as Board) });
        });
    }, 20_000);
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
    return () => {
      clearInterval(t);
      clearInterval(poll);
    };
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

/**
 * 02 候選名單 — one live ranking (owner, 2026-09-16). Rank, company, a
 * 關注度 bar, this hour's movement, and a 新 tag for companies that turned up
 * in the last hour. No raw nomination counts (memo v4.0 §4).
 */
export default function NominationBoard({ stats }: { stats: Stats }) {
  const { board, now } = useContext(BoardContext);
  // Every nominated company is listed (owner, 2026-09-23).
  const shown = board.hot;

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

  const freshAt = new Map(
    board.recent.map((c) => [c.domain, c.first_nominated_at]),
  );
  const isFresh = (domain: string) => {
    const t = freshAt.get(domain);
    if (!t || !ref) return false;
    return ref - new Date(t).getTime() < 60 * 60 * 1000;
  };

  return (
    <article className="bcard bcard--live">
      <header className="livehead">
        <div>
          <span className="k">NOMINATION FEED</span>
          <h3>
            <Icon icon={Flame} />
            提名動態
          </h3>
          <p className="bsub">
            這是提名名單，不是正式投票結果。同一家公司被提名多次，只代表它已被提名。
          </p>
        </div>
        <div
          className={
            stats.phase === "nominate" ? "period period--now" : "period"
          }
        >
          <Icon icon={CalendarDays} />
          <span>
            <span className="period__k">提名期間</span>
            <span className="period__v">
              {dateRange(stats.nominate_open, stats.nominate_close)}
            </span>
          </span>
        </div>
      </header>
      <BoardPie board={board} />
      <NameCloud board={board} />
      <ol className="rows rows--hot">
        {shown.map((c) => (
          <li key={c.domain}>
            <Favicon domain={c.domain} name={c.display_name} />
            <span className="co">
              <b>
                {c.display_name}
                {isFresh(c.domain) ? <span className="fresh">新</span> : null}
              </b>
              <span className="meta">
                <span className="meta__n">提名 {c.noms} 次</span>
                {c.sector && c.sector !== "未分類" ? (
                  <span className="meta__tag">{c.sector}</span>
                ) : null}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <footer className="boardfoot">
        <span className="bnote">
          目前 {board.total_companies} 家公司被提名。
        </span>
        <NominateCta stats={stats} className="btn btn--red btn--sm">
          <Icon icon={ArrowRight} />
        </NominateCta>
      </footer>
    </article>
  );
}
