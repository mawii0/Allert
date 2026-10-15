import { useEffect, useRef, useState } from "react";
import { getAuthToken, getCurrentUser, logout } from "./auth";
import { closeRecoverySession, RecoveryError, recoveryEmail, validRecoveryEmail, requestRecoveryCode, resetRecoveredPassword, verifyRecoveryCode, type RecoverySession } from "./password-recovery";

export function usePasswordRecovery(initialEmail = "") {
  const [email, setEmail] = useState(initialEmail.slice(0, 254));
  const [code, setCode] = useState("");
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [stage, setStage] = useState<"email" | "code" | "password" | "done">("email");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [nextSend, setNextSend] = useState(0), [now, setNow] = useState(Date.now());
  const session = useRef<RecoverySession | null>(null), working = useRef(false), generation = useRef(0), mounted = useRef(false);
  const pending = useRef<AbortController | null>(null), ownSignout = useRef(false);
  const discard = () => { const previous = session.current; session.current = null; if (previous) void closeRecoverySession(previous); };
  useEffect(() => {
    mounted.current = true;
    const reset = () => {
      if (ownSignout.current) return;
      generation.current++; pending.current?.abort(); pending.current = null; discard(); working.current = false;
      setEmail(""); setCode(""); setPassword(""); setConfirmation(""); setStage("email"); setBusy(false); setNotice("");
      setError("The signed-in account changed. Start password recovery again.");
    };
    const storage = (event: StorageEvent) => { if (!event.key || ["allert_user_id", "allert_auth_token", "allert_refresh_token"].includes(event.key)) reset(); };
    window.addEventListener("allert-session-changed", reset); window.addEventListener("storage", storage);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false; generation.current++; pending.current?.abort(); discard();
      window.clearInterval(timer); window.removeEventListener("allert-session-changed", reset); window.removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    if (session.current && session.current.expiresAt <= now && !working.current) {
      discard(); setStage("code"); setCode(""); setPassword(""); setConfirmation(""); setError("Recovery session expired. Request a new code.");
    }
  }, [now]);

  async function action(run: (current: () => boolean, signal: AbortSignal) => Promise<void>) {
    if (working.current || !mounted.current) return;
    working.current = true; setBusy(true); setError("");
    const version = generation.current, owner = getCurrentUser().id;
    const controller = new AbortController(); pending.current = controller;
    const current = () => mounted.current && version === generation.current && owner === getCurrentUser().id;
    try { await run(current, controller.signal); }
    catch (error) {
      if (current()) {
        setError(error instanceof Error ? error.message : "Password recovery failed. Try again.");
        if (error instanceof RecoveryError && [401, 403].includes(error.status)) { discard(); setStage("code"); setPassword(""); setConfirmation(""); }
      }
    } finally { if (current()) { working.current = false; pending.current = null; setBusy(false); } }
  }
  return {
    email, code, password, confirmation, stage, busy, error, notice,
    remaining: Math.max(0, Math.ceil((nextSend - now) / 1000)),
    setEmail, setCode, setPassword, setConfirmation,
    useExistingCode: () => {
      if (working.current || stage !== "email") return;
      if (!validRecoveryEmail(email)) { setError("Enter a valid email address."); return; }
      setEmail(recoveryEmail(email)); setCode(""); setError(""); setStage("code"); setNotice("Enter the latest recovery code for this email address.");
    },
    send: () => {
      if (!["email", "code"].includes(stage) || Date.now() < nextSend) return Promise.resolve();
      return action(async (current, signal) => {
        await requestRecoveryCode(email, signal);
        if (!current()) return;
        setEmail(recoveryEmail(email)); setCode(""); setStage("code"); setNextSend(Date.now() + 60000); setNow(Date.now());
        setNotice("If an account exists for this email, a recovery code will be sent. Check your inbox and spam folder.");
      });
    },
    verify: () => {
      if (stage !== "code") return Promise.resolve();
      return action(async (current, signal) => {
        const verified = await verifyRecoveryCode(email, code, signal);
        if (!current()) { void closeRecoverySession(verified); return; }
        session.current = verified; setCode(""); setStage("password"); setNotice("Email verified. Choose your new password.");
      });
    },
    save: () => {
      if (stage !== "password" || !session.current) return Promise.resolve();
      return action(async (current, signal) => {
        const verified = session.current!, previousId = getCurrentUser().id, previousToken = getAuthToken();
        const result = await resetRecoveredPassword(verified, password, confirmation, signal);
        if (!current()) return;
        session.current = null; setPassword(""); setConfirmation(""); setStage("done");
        working.current = false; pending.current = null; setBusy(false);
        setNotice(result.sessionsRevoked ? "Password updated. Sign in with your new password." : "Password updated. Sign in with your new password. Sign-out of other sessions could not be confirmed.");
        if (previousId === verified.userId && getCurrentUser().id === previousId && getAuthToken() === previousToken) {
          ownSignout.current = true;
          try { logout(); } finally { ownSignout.current = false; }
        }
      });
    },
    changeEmail: () => {
      if (working.current) return;
      generation.current++; discard(); setStage("email"); setCode(""); setPassword(""); setConfirmation(""); setError(""); setNotice("");
    },
  };
}
