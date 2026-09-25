"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Check, Link2, ThumbsUp } from "lucide-react";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import {
  SUPPORT_THRESHOLD,
  type PendingCandidate,
  type SupportResult,
} from "@/lib/types";
import Icon from "./Icon";
import { useParticipantEmail } from "./ParticipantEmail";

/** 遺珠支持成功 / 遺珠入池成功, verbatim (locked doc v1.0 §介面微文案). */
export const SUPPORT_OK = "支持已記錄。邀請更多人一起讓這個案例進入正式投票。";
export const POOL_OK =
  "這家公司已取得 11 個有效支持，正式進入投票池，並以 1 票起算。";

/** 分享提示, verbatim (locked doc v1.0 §沒有看到你心中的遺珠). */
export const remainingLine = (remaining: number) =>
  `再獲得 ${remaining} 個有效支持，就能進入正式投票。`;

const PROMPT = {
  title: "留下你的 Email",
  body: "資格支持以不同、有效 email 為單位；同一個 Email 對同一個候選只計一次。",
};

type Ctx = {
  /** False outside the vote phase: the buttons render disabled. */
  open: boolean;
  support: (
    domain: string,
    ok: (r: SupportResult) => void,
    fail: (message: string) => void,
  ) => void;
};

const SupportCtx = createContext<Ctx | null>(null);

/** One email prompt for every 支持 button on the page (spec v8 §6). */
export function SupportProvider({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const supabase = getBrowserClient();
  const identity = useParticipantEmail(PROMPT);
  const { require } = identity;

  const support = useCallback<Ctx["support"]>(
    (domain, ok, fail) => {
      if (!open) return;
      require(async (email) => {
        const { data, error } = await supabase.rpc("support_candidate", {
          p_domain: domain,
          p_email: email,
        });
        if (error) {
          fail(errText(error));
          return;
        }
        ok(data as SupportResult);
      });
    },
    [open, require, supabase],
  );

  return (
    <SupportCtx.Provider value={{ open, support }}>
      {children}
      {identity.modal}
    </SupportCtx.Provider>
  );
}

/** 資格支持進度 0–11 (locked doc v1.0 §畫面與資料顯示). */
export function CandidateProgress({ supports }: { supports: number }) {
  const pct = Math.max(
    0,
    Math.min(100, (supports / SUPPORT_THRESHOLD) * 100),
  );
  return (
    <div className="cprog">
      <span className="cprog__bar" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span
        className="cprog__n"
        aria-label={`資格支持 ${supports} / ${SUPPORT_THRESHOLD}`}
      >
        <b>{supports}</b> / {SUPPORT_THRESHOLD} 個有效支持
      </span>
    </div>
  );
}

/** Copies this candidate's own share link. */
export function CopyLink({ domain }: { domain: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={() => {
        const url = `${window.location.origin}/candidates/${encodeURIComponent(domain)}`;
        navigator.clipboard?.writeText(url);
        setCopied(true);
      }}
    >
      {copied ? (
        <Check size={16} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Link2 size={16} strokeWidth={1.75} aria-hidden="true" />
      )}
      {copied ? "已複製候選連結" : "分享候選連結"}
    </button>
  );
}

/**
 * One 待確認遺珠 (spec v8 §6). Never mixed into 目前的社群判斷: a pending
 * candidate has no official votes at all until it enters the pool.
 */
export function CandidateCard({
  candidate,
  linked = true,
}: {
  candidate: PendingCandidate;
  /** False on the candidate's own page, where the name is the H1. */
  linked?: boolean;
}) {
  const ctx = useContext(SupportCtx);
  const [supports, setSupports] = useState(candidate.supports);
  const [remaining, setRemaining] = useState(candidate.remaining);
  const [pooled, setPooled] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const open = ctx?.open ?? false;

  function click() {
    if (!ctx || !open || busy) return;
    setErr("");
    setBusy(true);
    ctx.support(
      candidate.domain,
      (r) => {
        setBusy(false);
        setSupports(r.supports);
        setRemaining(r.remaining);
        setPooled(r.in_pool);
        setMsg(r.just_entered || r.in_pool ? POOL_OK : SUPPORT_OK);
      },
      (m) => {
        setBusy(false);
        setErr(m);
      },
    );
  }

  return (
    <article className="ccard">
      <div className="ccard__head">
        {linked ? (
          <Link
            className="ccard__name"
            href={`/candidates/${encodeURIComponent(candidate.domain)}`}
          >
            {candidate.display_name}
          </Link>
        ) : (
          <span className="ccard__name">{candidate.display_name}</span>
        )}
        <span className="ccard__state">{pooled ? "正式候選" : "待確認遺珠"}</span>
      </div>
      {candidate.proposed_note ? (
        <p className="ccard__note">{candidate.proposed_note}</p>
      ) : null}
      <CandidateProgress supports={supports} />
      <p className="ccard__remain">
        {pooled ? POOL_OK : remainingLine(remaining)}
      </p>
      <div className="ccard__cta">
        <button
          type="button"
          className="btn btn--brand btn--sm"
          disabled={!open || busy || pooled}
          title={open ? undefined : "投票已截止"}
          onClick={click}
        >
          <Icon icon={ThumbsUp} />
          {busy ? "處理中…" : "支持這個案例"}
        </button>
        <CopyLink domain={candidate.domain} />
        {pooled ? (
          <Link
            className="btn btn--red btn--sm"
            href={`/vote?pick=${encodeURIComponent(candidate.domain)}`}
          >
            去投給它
          </Link>
        ) : null}
      </div>
      {msg ? <p className="ok">{msg}</p> : null}
      {err ? <p className="err">{err}</p> : null}
    </article>
  );
}
