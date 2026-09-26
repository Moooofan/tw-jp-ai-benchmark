"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Globe, Mail, MessageSquareText } from "lucide-react";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import type { PendingCandidate, ProposeResult, Stats } from "@/lib/types";
import {
  CandidateCard,
  SUPPORT_OK,
  SupportProvider,
} from "./CandidateSupport";
import Icon from "./Icon";
import {
  ensureAnonSession,
  readSavedEmail,
  writeSavedEmail,
} from "./ParticipantEmail";
import SiteChrome, { DISCLAIMER } from "./SiteChrome";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const NAME_MIN = 2;
const NOTE_MAX = 60;

/**
 * `/candidates` (spec v8 §6): the 待確認遺珠 list and the propose form. Copy
 * from the locked document 「沒有看到你心中的遺珠」, verbatim.
 */
export default function CandidatesClient({
  stats,
  initial,
}: {
  stats: Stats;
  initial: PendingCandidate[];
}) {
  const supabase = getBrowserClient();
  const open = stats.phase === "vote";
  const [list, setList] = useState(initial);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<ProposeResult | null>(null);

  useEffect(() => {
    const saved = readSavedEmail();
    if (saved) setEmail(saved);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, " ");
    const v = email.trim();
    if (n.length < NAME_MIN) {
      setErr("請填寫公司名稱。");
      return;
    }
    if (!EMAIL_RE.test(v)) {
      setErr("請確認 Email 格式。");
      return;
    }
    setErr("");
    setBusy(true);
    writeSavedEmail(v);
    try {
      await ensureAnonSession();
    } catch (e2) {
      setBusy(false);
      setErr(errText(e2));
      return;
    }
    const { data, error } = await supabase.rpc("propose_candidate", {
      p_name: n,
      p_url: url.trim(),
      p_email: v,
      p_note: note.trim(),
    });
    setBusy(false);
    if (error) {
      setErr(errText(error));
      return;
    }
    const r = data as ProposeResult;
    setDone(r);
    setName("");
    setUrl("");
    setNote("");
    if (!r.in_pool) {
      setList((all) =>
        all.some((c) => c.domain === r.domain)
          ? all.map((c) =>
              c.domain === r.domain
                ? { ...c, supports: r.supports, remaining: r.remaining }
                : c,
            )
          : [
              {
                domain: r.domain,
                display_name: r.display_name,
                supports: r.supports,
                remaining: r.remaining,
                proposed_at: new Date().toISOString(),
                proposed_note: note.trim(),
              },
              ...all,
            ],
      );
    }
  }

  return (
    <SiteChrome stats={stats}>
      <SupportProvider open={open}>
        <div className="pagehero">
          <div className="wrap">
            <span className="chip">Missing Cases</span>
            <h1>沒有看到你心中的遺珠</h1>
            <p>
              你仍然可以提出新的企業案例。新的公司會先進入「待確認遺珠」，取得超過 10
              個有效支持，也就是第 11 個不同 email 的支持後，才會正式進入投票池。
            </p>
          </div>
        </div>

        <div className="wrap">
          <div className="split">
            <div className="flow">
              <form className="formcard" noValidate onSubmit={submit}>
                <h3>提名一個遺珠</h3>
                <div className="f">
                  <label htmlFor="cand-name">
                    <Icon icon={Building2} />
                    公司名稱
                  </label>
                  <input
                    id="cand-name"
                    value={name}
                    autoComplete="off"
                    maxLength={60}
                    placeholder="例如：鼎泰豐"
                    disabled={!open}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="f">
                  <label htmlFor="cand-url">
                    <Icon icon={Globe} />
                    官網（選填）
                  </label>
                  <input
                    id="cand-url"
                    value={url}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="https://"
                    disabled={!open}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>
                <div className="f">
                  <label htmlFor="cand-email">
                    <Icon icon={Mail} />
                    Email
                  </label>
                  <input
                    id="cand-email"
                    value={email}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="name@company.com"
                    disabled={!open}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="f">
                  <label htmlFor="cand-note">
                    <Icon icon={MessageSquareText} />
                    一句話說明（選填）
                  </label>
                  <input
                    id="cand-note"
                    value={note}
                    autoComplete="off"
                    maxLength={NOTE_MAX}
                    placeholder="它進入日本市場的哪一個做法值得借鏡？"
                    disabled={!open}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                {err ? <p className="err">{err}</p> : null}
                {done ? (
                  done.in_pool ? (
                    <p className="ok">
                      {done.display_name} 已經在正式投票池裡，可以直接投票。{" "}
                      <Link href={`/vote?pick=${encodeURIComponent(done.domain)}`}>
                        去投給它
                      </Link>
                    </p>
                  ) : (
                    <p className="ok">{SUPPORT_OK}</p>
                  )
                ) : null}
                <div className="after">
                  <button
                    type="submit"
                    className="btn btn--red"
                    disabled={busy || !open}
                  >
                    {busy ? "送出中…" : "提名一個遺珠"}
                    <Icon icon={ArrowRight} />
                  </button>
                </div>
                {open ? null : (
                  <p className="fine">投票已截止，目前不開放新增遺珠。</p>
                )}
              </form>

              <section id="pending" className="pending">
                <h2 className="pending__h">待確認遺珠</h2>
                <p className="pending__p">
                  待確認遺珠尚未進入正式投票池，不與目前的社群判斷一起排序。
                </p>
                {list.length === 0 ? (
                  <p className="empty">
                    目前沒有待確認的遺珠。你可以用上面的表單提出第一個案例。
                  </p>
                ) : (
                  <div className="cgrid">
                    {list.map((c) => (
                      <CandidateCard key={c.domain} candidate={c} />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="side">
              <span className="k">入池門檻</span>
              <span className="v">11 個有效支持</span>
              <hr />
              <p className="fine">
                遺珠資格支持以不同、有效 email 為單位；同一 email 對同一候選只計一次。
              </p>
              <p className="fine">
                過去資格支持不轉成 11 票；正式票以 1 票起算。
              </p>
              <hr />
              <Link className="btn btn--line" href="/vote">
                去投正式的一票
              </Link>
              <p className="fine">{DISCLAIMER}</p>
            </aside>
          </div>
        </div>
      </SupportProvider>
    </SiteChrome>
  );
}
