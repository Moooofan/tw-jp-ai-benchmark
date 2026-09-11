"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errText, getBrowserClient } from "@/lib/supabase-browser";
import Modal from "./Modal";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STORAGE_KEY = "benchmark:email";

/**
 * Participant identity for the public site (nominate / 附議 / 存疑 / final
 * vote) — no OTP. The owner has no SMTP provider and Supabase's built-in
 * mailer only allows a couple of emails/hour project-wide, so public OTP is
 * not viable. Instead:
 *   - the browser gets one anonymous Supabase session on first write action,
 *     kept in the session cookie (never re-created after that);
 *   - the participant's email is a plain form field, remembered in
 *     localStorage, and is NEVER verified — it is only the de-duplication
 *     key the database RPCs use.
 * `require(fn, hint)` runs `fn(email)` once an email is known (asking via a
 * small modal if it is not yet), after making sure the anonymous session
 * exists.
 */
export function useParticipantEmail() {
  const supabase = getBrowserClient();
  const [email, setEmailState] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pending = useRef<((email: string) => void) | null>(null);
  const signingIn = useRef<Promise<void> | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setEmailState(saved);
    } catch {
      /* localStorage unavailable (private mode, disabled, ...) — fine. */
    }
  }, []);

  const saveEmail = useCallback((value: string) => {
    setEmailState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignore */
    }
  }, []);

  /** One anonymous sign-in per browser; safe to call repeatedly. */
  const ensureSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    if (!signingIn.current) {
      signingIn.current = supabase.auth.signInAnonymously().then(({ error }) => {
        if (error) {
          signingIn.current = null;
          throw error;
        }
      });
    }
    await signingIn.current;
  }, [supabase]);

  const require = useCallback(
    (fn: (email: string) => void, emailHint?: string) => {
      const hinted = (emailHint ?? "").trim();
      if (hinted && hinted !== email) saveEmail(hinted);
      const current = hinted || email;
      if (current) {
        void ensureSession()
          .then(() => fn(current))
          .catch((e) => window.alert(errText(e)));
        return;
      }
      pending.current = fn;
      setErr("");
      setOpen(true);
    },
    [email, ensureSession, saveEmail],
  );

  const close = useCallback(() => {
    pending.current = null;
    setOpen(false);
  }, []);

  const submit = useCallback(
    async (value: string) => {
      const v = value.trim();
      if (!EMAIL_RE.test(v)) {
        setErr("請確認 Email 格式。");
        return;
      }
      setBusy(true);
      setErr("");
      try {
        await ensureSession();
      } catch (e) {
        setBusy(false);
        setErr(errText(e));
        return;
      }
      setBusy(false);
      saveEmail(v);
      setOpen(false);
      const fn = pending.current;
      pending.current = null;
      if (fn) fn(v);
    },
    [ensureSession, saveEmail],
  );

  const modal = (
    <EmailPromptModal
      open={open}
      busy={busy}
      err={err}
      onClose={close}
      onSubmit={submit}
    />
  );

  return { email, require, modal, hasEmail: !!email };
}

function EmailPromptModal({
  open,
  busy,
  err,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  err: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  return (
    <Modal open={open} onClose={onClose}>
      <h3>留下你的 Email</h3>
      <p>請留下 Email，同一信箱只計一次。不公開、不寄信。</p>
      <input
        type="email"
        autoComplete="email"
        placeholder="name@company.com"
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit(value);
        }}
      />
      <p className="err">{err}</p>
      <button
        className="cta cta--fill"
        type="button"
        disabled={busy}
        onClick={() => onSubmit(value)}
      >
        {busy ? "處理中…" : "繼續"}
      </button>
    </Modal>
  );
}
