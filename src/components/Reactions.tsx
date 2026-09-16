"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { MyVoteState, ReactionCounts } from "@/lib/types";
import { useParticipantEmail } from "./ParticipantEmail";

const PROMPT = {
  title: "留下你的 Email",
  body: "推或噓之前，請留下 Email。同一個 Email 對同一則理由只能表態一次。",
};

type Stance = 0 | 1 | -1;

type Ctx = {
  /** False once voting has closed: buttons render disabled. */
  open: boolean;
  mine: Record<number, 1 | -1>;
  isOwn: (domain: string, reason: string) => boolean;
  react: (
    pickId: number,
    value: 1 | -1,
    apply: (stance: Stance, server: ReactionCounts | null) => void,
    fail: (message: string) => void,
  ) => void;
};

const ReactionCtx = createContext<Ctx | null>(null);

const ownKey = (domain: string, reason: string) => `${domain}|${reason}`;

/**
 * 推 / 噓 state for every reason card on a page (spec v7b §1.5): the email
 * (asked once, remembered), this email's stances, and its own reasons today
 * (best effort: my_vote_state has no pick ids, so domain + text are matched).
 */
export function ReactionProvider({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const supabase = getBrowserClient();
  const identity = useParticipantEmail(PROMPT);
  const [mine, setMine] = useState<Record<number, 1 | -1>>({});
  const [own, setOwn] = useState<Set<string>>(new Set());
  const loadedFor = useRef("");
  const mineRef = useRef(mine);
  mineRef.current = mine;

  const load = useCallback(
    async (email: string) => {
      const key = email.trim().toLowerCase();
      if (!key || loadedFor.current === key) return;
      const { data } = await supabase.rpc("my_vote_state", { p_email: email });
      const state = data as MyVoteState | null;
      if (!state) return;
      loadedFor.current = key;
      const m: Record<number, 1 | -1> = {};
      for (const r of state.reactions ?? []) m[r.pick_id] = r.value;
      mineRef.current = m;
      setMine(m);
      setOwn(new Set((state.today ?? []).map((t) => ownKey(t.domain, t.reason))));
    },
    [supabase],
  );

  useEffect(() => {
    if (identity.email) void load(identity.email);
  }, [identity.email, load]);

  const isOwn = useCallback(
    (domain: string, reason: string) => own.has(ownKey(domain, reason)),
    [own],
  );

  const setStance = useCallback((pickId: number, s: Stance) => {
    setMine((m) => {
      const copy = { ...m };
      if (s === 0) delete copy[pickId];
      else copy[pickId] = s;
      mineRef.current = copy;
      return copy;
    });
  }, []);

  const { require } = identity;
  const react = useCallback<Ctx["react"]>(
    (pickId, value, apply, fail) => {
      if (!open) return;
      require(async (email) => {
        await load(email);
        const prev: Stance = mineRef.current[pickId] ?? 0;
        const next: Stance = prev === value ? 0 : value;
        setStance(pickId, next);
        apply(next, null);
        const { data, error } = await supabase.rpc("react_reason", {
          p_pick_id: pickId,
          p_email: email,
          p_value: next,
        });
        if (error) {
          setStance(pickId, prev);
          apply(prev, null);
          fail(errText(error));
          return;
        }
        apply(next, data as ReactionCounts);
      });
    },
    [open, require, load, setStance, supabase],
  );

  return (
    <ReactionCtx.Provider value={{ open, mine, isOwn, react }}>
      {children}
      {identity.modal}
    </ReactionCtx.Provider>
  );
}

/** One reason with its 推 / 噓 buttons (home and company pages). */
export function ReasonCard({
  pickId,
  domain,
  displayName,
  reason,
  likes,
  dislikes,
}: {
  pickId: number;
  domain: string;
  /** Shown as a link to the company page; omit on the company page itself. */
  displayName?: string;
  reason: string;
  likes: number;
  dislikes: number;
}) {
  const ctx = useContext(ReactionCtx);
  const server = useRef<ReactionCounts>({ likes, dislikes });
  const [counts, setCounts] = useState<ReactionCounts>({ likes, dislikes });
  const [err, setErr] = useState("");

  // A board refresh brings new server counts.
  useEffect(() => {
    server.current = { likes, dislikes };
    setCounts({ likes, dislikes });
  }, [likes, dislikes]);

  const stance: Stance = ctx?.mine[pickId] ?? 0;
  const own = ctx?.isOwn(domain, reason) ?? false;
  const open = ctx?.open ?? false;
  const disabled = !open || own;
  const title = !open
    ? "投票已截止"
    : own
      ? "不能對自己的理由表態"
      : undefined;

  function click(value: 1 | -1) {
    if (!ctx || disabled) return;
    setErr("");
    // Counts without this email's current stance, so any stance can be re-applied.
    const base = { ...counts };
    if (stance === 1) base.likes -= 1;
    if (stance === -1) base.dislikes -= 1;
    ctx.react(
      pickId,
      value,
      (next, fromServer) => {
        if (fromServer) {
          server.current = fromServer;
          setCounts(fromServer);
          return;
        }
        setCounts({
          likes: base.likes + (next === 1 ? 1 : 0),
          dislikes: base.dislikes + (next === -1 ? 1 : 0),
        });
      },
      setErr,
    );
  }

  return (
    <article className="rcard">
      {displayName ? (
        <Link
          className="rcard__co"
          href={`/company/${encodeURIComponent(domain)}`}
        >
          {displayName}
        </Link>
      ) : null}
      <p className="rcard__text">{reason}</p>
      <div className="rcard__foot">
        <button
          type="button"
          className={stance === 1 ? "rx on" : "rx"}
          aria-pressed={stance === 1}
          disabled={disabled}
          title={title}
          onClick={() => click(1)}
        >
          <ThumbsUp size={16} strokeWidth={1.75} aria-hidden="true" />
          推<span className="rx__n">{counts.likes}</span>
        </button>
        <button
          type="button"
          className={stance === -1 ? "rx rx--down on" : "rx rx--down"}
          aria-pressed={stance === -1}
          disabled={disabled}
          title={title}
          onClick={() => click(-1)}
        >
          <ThumbsDown size={16} strokeWidth={1.75} aria-hidden="true" />
          噓<span className="rx__n">{counts.dislikes}</span>
        </button>
      </div>
      {err ? <p className="err">{err}</p> : null}
    </article>
  );
}
