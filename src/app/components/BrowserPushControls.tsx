import "../../styles/patient-actions.css";
import { ForecastNotices } from "./ForecastNotices";
import { useEffect, useState } from "react";
import { useBrowserPush } from "../utils/useBrowserPush";

export function BrowserPushControls({ enabled }: { enabled: boolean }) {
  const push = useBrowserPush();
  const [draft, setDraft] = useState({ enabled: false, start: "22:00", end: "07:00" });
  useEffect(() => { setDraft({ enabled: push.quiet.enabled, start: push.quiet.start, end: push.quiet.end }); }, [push.quiet]);
  const disabled = push.loading || push.busy;
  const buttonStyle = "allert-secondary text-xs text-emerald-300 disabled:opacity-50";
  return <div className="space-y-3 text-xs" aria-label="Browser push settings">
    <h3 className="font-medium text-sm text-zinc-100">This browser</h3>
    <p role="status" className="text-zinc-300">{push.loading ? "Checking browser push…" : push.error ? "Browser push settings need attention. Refresh below." : !push.supported ? "Push is unavailable here. On iPhone (iOS 16.4 or later), use Safari → Share → Add to Home Screen, then open ALLERT from its icon." :
      !push.configured ? "Notifications are temporarily unavailable. Please try again later." : push.connected ? "This browser is connected." : "This browser is not connected."}</p>
    <div className="browser-push-actions">
      {!push.connected && <button type="button" className={buttonStyle} disabled={disabled || !enabled || !push.supported || !push.configured} onClick={() => { void push.connect(); }}>Connect this browser</button>}
      {push.connected && <>
        <button type="button" className={buttonStyle} disabled={disabled || !enabled} onClick={() => { void push.test(); }}>Send test notification</button>
        <button type="button" className={buttonStyle} disabled={disabled} onClick={() => { void push.disconnect(); }}>Disconnect this browser</button>
      </>}
      <button type="button" className="allert-action-link" disabled={disabled} onClick={push.refresh}>Refresh browser push</button>
    </div>
    {!enabled && <p className="text-zinc-500">Turn on Push Notifications above before connecting or sending a test.</p>}
    <details className="text-zinc-400">
      <summary className="cursor-pointer">Quiet hours · Asia/Manila</summary>
      <div className="space-y-3 pt-3">
        <label className="flex items-center gap-2"><input type="checkbox" checked={draft.enabled} disabled={disabled} onChange={event => setDraft({ ...draft, enabled: event.target.checked })} />Enable quiet hours</label>
        <div className="flex flex-wrap gap-3">
          <label>Start <input aria-label="Quiet hours start" type="time" value={draft.start} disabled={disabled} onChange={event => setDraft({ ...draft, start: event.target.value })} className="ml-1 rounded border border-zinc-700 bg-zinc-900 p-1 text-white" /></label>
          <label>End <input aria-label="Quiet hours end" type="time" value={draft.end} disabled={disabled} onChange={event => setDraft({ ...draft, end: event.target.value })} className="ml-1 rounded border border-zinc-700 bg-zinc-900 p-1 text-white" /></label>
        </div>
        <p>Notifications, including tests, are paused from the start time until the end time. Overnight ranges are supported.</p>
        <button type="button" className={buttonStyle} disabled={disabled || !draft.start || !draft.end || draft.start === draft.end} onClick={() => { void push.saveQuiet(draft); }}>Save quiet hours</button>
      </div>
    </details>
    {push.message && <p role="status" className="text-emerald-300">{push.message}</p>}
    {push.error && <p role="alert" className="text-red-300">{push.error}</p>}
    <p className="text-zinc-500">{push.automaticAlertsReady?"Sensor alerts are available. Your preferences and quiet hours control delivery.":"Automatic sensor alerts are not confirmed active."}</p>
    <ForecastNotices compact />
  </div>;
}
