import { useEffect, useRef, useState } from "react";
import { getCurrentUser } from "./auth";
import { privateApi } from "./private-api";
import { browserPushConnected, connectBrowser, disconnectBrowser, testBrowserPush, pushSupported } from "./browser-push";
import { defaultQuietHours, validQuietHours } from "../../../supabase/functions/server/push-policy.mjs";

export function useBrowserPush() {
  const [config, setConfig] = useState<{ configured: boolean; publicKey: string | null } | null>(null);
  const [quiet, setQuiet] = useState(defaultQuietHours);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0), working = useRef(false), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const version = ++generation.current, owner = getCurrentUser().id, controller = new AbortController();
    const current = () => mounted.current && generation.current === version && getCurrentUser().id === owner;
    setLoading(true); setError(""); setMessage(""); setConfig(null); setConnected(false);
    void (async () => {
      const result = await privateApi<any>("/push", { signal: controller.signal });
      if (!validQuietHours(result.quietHours) || typeof result.configured !== "boolean" ||
          (result.configured && !/^[A-Za-z0-9_-]{87}$/.test(result.publicKey))) throw Error("Invalid push settings response. Check the backend deployment.");
      if (!current()) return;
      setConfig(result); setQuiet(result.quietHours);
      const active = await browserPushConnected();
      if (current()) setConnected(active);
    })().catch(error => { if (current()) setError(error instanceof Error ? error.message : "Unable to load browser push."); })
      .finally(() => { if (current()) setLoading(false); });
    const reset = () => {
      generation.current++; controller.abort(); working.current = false;
      setBusy(false); setConfig(null); setQuiet(defaultQuietHours()); setConnected(false); setMessage(""); setAttempt(value => value + 1);
    };
    const focus = () => { if (!working.current) setAttempt(value => value + 1); };
    window.addEventListener("allert-session-changed", reset); window.addEventListener("storage", reset); window.addEventListener("focus", focus);
    return () => {
      mounted.current = false; controller.abort();
      window.removeEventListener("allert-session-changed", reset); window.removeEventListener("storage", reset); window.removeEventListener("focus", focus);
    };
  }, [attempt]);
  async function action(run: (current: () => boolean) => Promise<void>) {
    if (working.current || loading) return;
    working.current = true; setBusy(true); setError(""); setMessage("");
    const version = generation.current, owner = getCurrentUser().id;
    const current = () => mounted.current && version === generation.current && owner === getCurrentUser().id;
    try { await run(current); }
    catch (error) { if (current()) setError(error instanceof Error ? error.message : "Push request failed."); }
    finally { if (current()) { working.current = false; setBusy(false); } }
  }
  return {
    quiet, connected, loading, busy, error, message, supported: pushSupported(), configured: config?.configured === true,
    refresh: () => { if (!working.current) setAttempt(value => value + 1); },
    connect: () => action(async current => {
      if (!config?.publicKey) throw Error("Configure push keys in Supabase first.");
      await connectBrowser(config.publicKey);
      if (current()) { setConnected(true); setMessage("This browser is connected. Send a test to check delivery."); }
    }),
    disconnect: () => action(async current => {
      const cleaned = await disconnectBrowser();
      if (current()) { setConnected(false); setMessage(cleaned ? "This browser is disconnected." : "Browser disconnected locally; server cleanup failed. Refresh settings before reconnecting."); }
    }),
    test: () => action(async current => {
      const outcome = await testBrowserPush();
      if (!current()) return;
      if (outcome === "accepted") setMessage("The push service accepted the test. Check Chrome or Windows Notification Center for ALLERT.");
      else if (outcome === "quiet_hours") setMessage("No test was sent because quiet hours are active in Asia/Manila.");
      else if (outcome === "already_attempted") setMessage("This test was already attempted. Check Chrome before sending another.");
      else throw Error("Unknown delivery response. Check the backend deployment.");
    }),
    saveQuiet: (value: { enabled: boolean; start: string; end: string }) => action(async () => {
      const owner = getCurrentUser().id, version = generation.current;
      const result = await privateApi<any>("/push/quiet-hours", { method: "PUT", body: { ...value, revision: quiet.revision } });
      if (!validQuietHours(result.quietHours)) throw Error("Invalid quiet hours response.");
      if (owner === getCurrentUser().id && version === generation.current && mounted.current) { setQuiet(result.quietHours); setMessage("Quiet hours saved in Asia/Manila time."); }
    }),
  };
}
