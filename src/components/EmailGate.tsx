"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import Modal from "./Modal";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Step = "email" | "code";

/**
 * Email OTP gate. `require(fn)` runs `fn` immediately when a session exists,
 * otherwise it opens the modal and runs `fn` after a successful verification.
 */
export function useEmailGate() {
  const supabase = getBrowserClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
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
    (fn: () => void) => {
      if (session) {
        fn();
        return;
      }
      pending.current = fn;
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
    <EmailModal open={open} onClose={close} onVerified={onVerified} />
  );

  return { session, ready, require, modal, signedIn: !!session };
}

function EmailModal({
  open,
  onClose,
  onVerified,
}: {
  open: boolean;
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
      setCode("");
      setErr("");
      setBusy(false);
    }
  }, [open]);

  async function send() {
    const v = email.trim();
    if (!EMAIL_RE.test(v)) {
      setErr("這個信箱怪怪的。");
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
      setErr("驗證碼是六位數字。");
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
      setErr("不對，再看一次信。");
      return;
    }
    onVerified();
  }

  return (
    <Modal open={open} onClose={onClose}>
      {step === "email" ? (
        <>
          <h3>先留信箱</h3>
          <p>一個信箱只能推一次，這樣被推爆的才算數。</p>
          <input
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
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
            className="btn btn--sm"
            type="button"
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? "寄出中…" : "寄驗證碼"}
          </button>
          <p className="fine">驗一次就好，之後不用再驗。信箱不公開。</p>
        </>
      ) : (
        <>
          <h3>驗證碼</h3>
          <p>寄到 {email.trim()} 了，六位數。</p>
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
            className="btn btn--sm"
            type="button"
            disabled={busy}
            onClick={() => void verify()}
          >
            {busy ? "確認中…" : "好了"}
          </button>
          <button
            className="abtn"
            type="button"
            onClick={() => {
              setStep("email");
              setErr("");
            }}
          >
            信箱打錯了
          </button>
        </>
      )}
    </Modal>
  );
}
