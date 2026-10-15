import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { usePasswordRecovery } from "../utils/usePasswordRecovery";
import logoImage from "../../imports/AllertLogoTransparent1.png";

export function PasswordRecoveryScreen() {
  const navigate = useNavigate(), location = useLocation();
  const initialEmail = typeof location.state?.email === "string" ? location.state.email : "";
  const recovery = usePasswordRecovery(initialEmail);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [recovery.stage]);
  const inputClass = "bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500";
  const buttonClass = "w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed";
  const submit = () => recovery.stage === "email" ? recovery.send() : recovery.stage === "code" ? recovery.verify() : recovery.save();
  return <div className="min-h-screen bg-zinc-950 text-white">
    <div className="w-full max-w-md mx-auto min-h-screen bg-gradient-to-b from-emerald-950 via-zinc-950 to-zinc-950 px-6 py-12 flex flex-col items-center justify-center">
      <div className="text-center mb-8">
        <div className="mx-auto mb-2 w-full max-w-[130px]"><img src={logoImage} alt="Allert Logo" className="w-full h-auto" /></div>
        <h1 className="text-3xl font-bold mb-2 text-white">ALLERT</h1>
        <p className="text-zinc-400 text-sm">Allergic Rhinitis Monitoring System</p>
      </div>
      <div className="w-full bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800 shadow-xl">
        <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold mb-2">{recovery.stage === "done" ? "Password updated" : "Reset your password"}</h2>
        <p className="text-sm text-zinc-400 mb-6">{recovery.stage === "email" ? "Enter the email address linked to your ALLERT account." :
          recovery.stage === "code" ? `Enter the recovery code sent to ${recovery.email}.` :
          recovery.stage === "password" ? `Choose a new password for ${recovery.email}. Keep this page open until you save.` : "Use your new password the next time you sign in."}</p>
        {recovery.notice && <p role="status" className="mb-4 text-sm text-emerald-300">{recovery.notice}</p>}
        {recovery.error && <div role="alert" className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" /><p className="text-sm text-red-300">{recovery.error}</p>
        </div>}
        {recovery.stage !== "done" && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
          {recovery.stage === "email" && <div>
            <Label htmlFor="recovery-email" className="text-sm text-zinc-300 mb-2 block">Email</Label>
            <Input id="recovery-email" type="email" autoComplete="email" required maxLength={254} value={recovery.email} onChange={event => recovery.setEmail(event.target.value)} disabled={recovery.busy} className={inputClass} placeholder="you@example.com" />
          </div>}
          {recovery.stage === "code" && <div>
            <Label htmlFor="recovery-code" className="text-sm text-zinc-300 mb-2 block">Recovery code</Label>
            <Input id="recovery-code" type="text" inputMode="numeric" autoComplete="one-time-code" required maxLength={14} value={recovery.code} onChange={event => recovery.setCode(event.target.value)} disabled={recovery.busy} className={inputClass} aria-describedby="recovery-code-help" />
            <p id="recovery-code-help" className="mt-2 text-xs text-zinc-500">Use the latest code from your email. Codes can be used once.</p>
          </div>}
          {recovery.stage === "password" && <>
            <div>
              <Label htmlFor="recovery-password" className="text-sm text-zinc-300 mb-2 block">New password</Label>
              <Input id="recovery-password" type="password" autoComplete="new-password" required minLength={6} maxLength={200} value={recovery.password} onChange={event => recovery.setPassword(event.target.value)} disabled={recovery.busy} className={inputClass} aria-describedby="recovery-password-help" />
              <p id="recovery-password-help" className="mt-2 text-xs text-zinc-500">At least 6 characters. Your account may require a stronger password.</p>
            </div>
            <div>
              <Label htmlFor="recovery-confirmation" className="text-sm text-zinc-300 mb-2 block">Confirm new password</Label>
              <Input id="recovery-confirmation" type="password" autoComplete="new-password" required minLength={6} maxLength={200} value={recovery.confirmation} onChange={event => recovery.setConfirmation(event.target.value)} disabled={recovery.busy} className={inputClass} />
            </div>
          </>}
          <Button type="submit" disabled={recovery.busy || (recovery.stage === "email" && recovery.remaining > 0)} className={buttonClass}>
            {recovery.busy ? <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Please wait…</> :
              recovery.stage === "email" ? recovery.remaining > 0 ? `Send code in ${recovery.remaining}s` : "Send recovery code" :
              recovery.stage === "code" ? "Verify code" : "Save new password"}
          </Button>
        </form>}
        {recovery.stage === "email" && <button type="button" disabled={recovery.busy} onClick={recovery.useExistingCode} className="mt-4 text-xs text-emerald-400 underline disabled:opacity-50">I already have a code</button>}
        {recovery.stage === "code" && <div className="mt-4 flex flex-wrap gap-4 text-xs">
          <button type="button" disabled={recovery.busy || recovery.remaining > 0} onClick={() => { void recovery.send(); }} className="text-emerald-400 underline disabled:opacity-50">{recovery.remaining > 0 ? `Resend code in ${recovery.remaining}s` : "Resend code"}</button>
          <button type="button" disabled={recovery.busy} onClick={recovery.changeEmail} className="text-zinc-400 underline disabled:opacity-50">Use a different email</button>
        </div>}
        <button type="button" disabled={recovery.busy} onClick={() => navigate("/", { replace: true })} className="mt-6 flex items-center gap-2 text-sm text-emerald-400 disabled:opacity-50"><ArrowLeft className="h-4 w-4" />Back to sign in</button>
      </div>
    </div>
  </div>;
}
