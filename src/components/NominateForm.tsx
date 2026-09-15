"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  Link as LinkIcon,
  MapPin,
  MessageSquareText,
  UserCheck,
} from "lucide-react";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import Icon from "./Icon";
import type { useParticipantEmail } from "./ParticipantEmail";

const SUGGEST_MS = 250;
const REASON_MIN = 10;
const REASON_MAX = 50;

/**
 * The five numbered fields, unchanged (spec v5 adds the checklist icons). Submits through the existing
 * `nominate(p_company, p_company_en, p_url, p_reason, p_email)` RPC and the
 * unchanged anonymous-session + email dedupe flow (`identity.require`).
 */
export default function NominateForm({
  identity,
  onDone,
}: {
  identity: ReturnType<typeof useParticipantEmail>;
  onDone: (company: string, email: string) => void;
}) {
  const supabase = getBrowserClient();
  const [company, setCompany] = useState("");
  const [companyEn, setCompanyEn] = useState("");
  const [url, setUrl] = useState("");
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [suggest, setSuggest] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = company.trim();
    if (!q) {
      setSuggest([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("company_suggest", { q });
      setSuggest(
        ((data as { company: string }[] | null) ?? [])
          .map((r) => r.company)
          .filter((n) => n.toLowerCase() !== q.toLowerCase())
          .slice(0, 4),
      );
    }, SUGGEST_MS);
    return () => clearTimeout(t);
  }, [company, supabase]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = company.trim();
    const ce = companyEn.trim();
    const u = url.trim();
    const w = reason.trim();
    const m = email.trim();
    if (!c) {
      setErr("請填寫公司中文名稱。");
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      setErr("官方網址請以 http:// 或 https:// 開頭。");
      return;
    }
    if (w.length < REASON_MIN || w.length > REASON_MAX) {
      setErr("理由請寫 10 到 50 字");
      return;
    }
    if (m && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m)) {
      setErr("請確認 Email 格式。");
      return;
    }
    setErr("");
    identity.require(async (viewerEmail) => {
      setBusy(true);
      const { error } = await supabase.rpc("nominate", {
        p_company: c,
        p_company_en: ce,
        p_url: u,
        p_reason: w,
        p_email: viewerEmail,
      });
      setBusy(false);
      if (error) {
        setErr(errText(error));
        return;
      }
      setCompany("");
      setCompanyEn("");
      setUrl("");
      setReason("");
      setSuggest([]);
      onDone(c, viewerEmail);
    }, m);
  }

  const over = reason.length > REASON_MAX;

  return (
    <form className="form" noValidate onSubmit={submit}>
      <div className="f">
        <label htmlFor="zh">
          <Icon icon={MapPin} />
          <span className="n">01</span>公司中文名稱
        </label>
        <input
          id="zh"
          value={company}
          maxLength={40}
          autoComplete="off"
          placeholder="例：某某科技"
          onChange={(e) => {
            setCompany(e.target.value);
            setErr("");
          }}
        />
        {suggest.length > 0 ? (
          <div className="suggest">
            {suggest.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  setCompany(n);
                  setSuggest([]);
                }}
              >
                已有人提名：{n}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="f">
        <label htmlFor="en">
          <Icon icon={MapPin} />
          <span className="n">02</span>公司英文名稱
        </label>
        <input
          id="en"
          value={companyEn}
          maxLength={80}
          autoComplete="off"
          placeholder="Example Inc."
          onChange={(e) => setCompanyEn(e.target.value)}
        />
      </div>
      <div className="f full">
        <label htmlFor="url">
          <Icon icon={LinkIcon} />
          <span className="n">03</span>官方網址
        </label>
        <input
          id="url"
          type="url"
          value={url}
          placeholder="https://"
          onChange={(e) => {
            setUrl(e.target.value);
            setErr("");
          }}
        />
      </div>
      <div className="f full">
        <label htmlFor="why">
          <Icon icon={MessageSquareText} />
          <span className="n">04</span>提名理由
        </label>
        <textarea
          id="why"
          value={reason}
          maxLength={REASON_MAX}
          placeholder="它在日本市場做了什麼、為什麼值得被觀察（10–50 字）"
          onChange={(e) => {
            setReason(e.target.value);
            setErr("");
          }}
        />
        <p className="hint">
          <span>具體的事實比形容詞有用。</span>
          <span className={over ? "over" : undefined}>
            {reason.length}/{REASON_MAX}
          </span>
        </p>
      </div>
      <div className="f full">
        <label htmlFor="mail">
          <Icon icon={UserCheck} />
          <span className="n">05</span>你的 Email
        </label>
        <input
          id="mail"
          type="email"
          value={email}
          autoComplete="email"
          placeholder="name@company.com"
          onChange={(e) => {
            setEmail(e.target.value);
            setErr("");
          }}
        />
        <p className="hint">
          <span>Email 僅用於去重，不公開、不作行銷使用。</span>
        </p>
        {err ? <p className="err">{err}</p> : null}
      </div>
      <div className="form__foot">
        <button className="btn btn--red" type="submit" disabled={busy}>
          {busy ? "送出中…" : "送出提名"}
          <Icon icon={ArrowRight} />
        </button>
      </div>
    </form>
  );
}
