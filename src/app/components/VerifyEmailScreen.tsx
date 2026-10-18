import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { MailCheck } from "lucide-react";
import { projectId, publicAnonKey } from "/utils/supabase/info";
import { storeSession } from "../utils/auth";
import logoImage from "../../imports/AllertLogoTransparent1.png";

export function VerifyEmailScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email || "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (window.location.hash.includes("access_token=")) {
      setMessage("Your email is confirmed. Return to Sign In to continue.");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  async function request(path: string, body: object) {
    const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-a473accf/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${publicAnonKey}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to verify your email.");
    return data;
  }

  async function verify() {
    if (busy) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      const data = await request("verify-email", { email: email.trim(), token: code.trim() });
      storeSession(data);
      navigate("/onboarding", { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to verify your email."); }
    finally { setBusy(false); }
  }

  async function resend() {
    if (busy) return;
    setError(""); setMessage(""); setBusy(true);
    try { await request("resend-verification", { email: email.trim() }); setMessage("If this address has a pending registration, a new confirmation email has been sent."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to resend confirmation."); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-zinc-950 text-white px-6 py-12">
    <div className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <img src={logoImage} alt="ALLERT" className="mx-auto mb-5 h-20 w-20" />
      <MailCheck aria-hidden="true" className="mb-3 h-8 w-8 text-emerald-400" />
      <h1 className="text-2xl font-bold">Verify your email</h1>
      <p className="mt-2 text-sm text-zinc-300">Open the confirmation email and follow its link. If the email includes a code, enter it here. Return to Sign In after using the link.</p>
      <label htmlFor="verification-email" className="mt-6 block text-sm">Email address</label>
      <input id="verification-email" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3" />
      <label htmlFor="verification-code" className="mt-4 block text-sm">Verification code</label>
      <input id="verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={event => setCode(event.target.value.replace(/\D/g,""))} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3" />
      {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-emerald-300">{message}</p>}
      <button type="button" disabled={busy || !email || code.length < 6} onClick={() => { void verify(); }} className="mt-6 w-full rounded-xl bg-emerald-600 p-3 font-semibold disabled:opacity-50">Verify code</button>
      <button type="button" disabled={busy || !email} onClick={() => { void resend(); }} className="mt-3 w-full rounded-xl border border-zinc-600 p-3 text-sm disabled:opacity-50">Resend confirmation</button>
      <button type="button" onClick={() => navigate("/")} className="mt-3 w-full rounded-xl border border-zinc-700 p-3 text-sm">Return to Sign In</button>
    </div>
  </main>;
}
