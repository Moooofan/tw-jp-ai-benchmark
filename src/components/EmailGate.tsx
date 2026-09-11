"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import Modal from "./Modal";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Step = "email" | "code";

/**
 * Email OTP gate. `require(fn, hint)` runs `fn` immediately when a session
 * exists, otherwise it opens the modal — pre-filled with `hint`, the address
 * the caller already typed into the form — and runs `fn` after verification.
 */
export function useEmailGate() {
  const supabase = getBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setReady(true);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const require = useCallback(
    (fn: () => void, emailHint?: string) => {
      if (session) {
        fn();
        return;
      }
      pending.current = fn;
      setHint(emailHint ?? "");
      setOpen(true);
    },
    [session],
  );

  const close = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  const onVerified = useCallback(() => {
    setOpen(false);
    const fn = pending.current;
    pending.current = null;
    if (fn) fn();
  }, []);

  const modal = (
    <EmailModal
      open={open}
      hint={hint}
      onClose={close}
      onVerified={onVerified}
    />
  );

  return { session, ready, require, modal, signedIn: !!session };
}

function EmailModal({
  open,
  hint,
  onClose,
  onVerified,
}: {
  open: boolean;
  hint: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const supabase = getBrowserClient();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("email");
      setEmail(hint);
      setCode("");
      setErr("");
      setBusy(false);
    }
  }, [open, hint]);

  async function send() {
    const v = email.trim();
    if (!EMAIL_RE.test(v)) {
      setErr("請確認 Email 格式。");
      return;
    }
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email: v,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      setErr(errText(error));
      return;
    }
    setStep("code");
  }

  async function verify() {
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setErr("驗證碼是 6 位數字。");
      return;
    }
    setBusy(true);
    setErr("");
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    setBusy(false);
    if (error) {
      setErr("驗證碼不正確，請再確認信件內容。");
      return;
    }
    onVerified();
  }

  return (
    <Modal open={open} onClose={onClose}>
      {step === "email" ? (
        <>
          <h3>驗證你的 Email</h3>
          <p>
            Email 僅用於去重與驗證，不公開，不作行銷使用。送出後將寄出 6 位數驗證碼。
          </p>
          <input
            type="email"
            autoComplete="email"
            placeholder="name@company.com"
            value={email}
            autoFocus
            onChange={(e) => {
              setEmail(e.target.value);
              setErr("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
          />
          <p className="err">{err}</p>
          <button
            className="cta cta--fill"
            type="button"
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? "寄送中…" : "寄出驗證碼"}
          </button>
          <p className="fine">驗證一次後 30 天內免再驗。</p>
        </>
      ) : (
        <>
          <h3>輸入驗證碼</h3>
          <p>驗證碼已寄到 {email.trim()}，請輸入 6 位數字。</p>
          <input
            className="code"
            inputMode="numeric"
            maxLength={6}
            placeholder="······"
            value={code}
            autoFocus
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ""));
              setErr("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void verify();
            }}
          />
          <p className="err">{err}</p>
          <button
            className="cta cta--fill"
            type="button"
            disabled={busy}
            onClick={() => void verify()}
          >
            {busy ? "確認中…" : "確認"}
          </button>
          <button
            className="linkbtn"
            type="button"
            onClick={() => {
              setStep("email");
              setErr("");
            }}
          >
            修改 Email
          </button>
        </>
      )}
    </Modal>
  );
}
