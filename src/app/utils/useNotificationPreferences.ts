import { useEffect, useRef, useState } from "react";
import { getCurrentUser } from "./auth";
import { privateApi } from "./private-api";
import { validNotificationPreferences } from "../../../supabase/functions/server/notification-preferences.mjs";
import { notificationPermission, requestNotificationPermission, notificationStatus } from "./notification-permission";

interface NotificationPreferences { enabled: boolean; revision: number; updatedAt: string | null; }
interface PreferenceResponse { preferences: NotificationPreferences; deliveryReady: false; }

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [permission, setPermission] = useState(notificationPermission);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(false);
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const currentGeneration = ++generation.current;
    const account = getCurrentUser().id;
    const controller = new AbortController();
    setLoading(true); setError("");
    const current = () => active && generation.current === currentGeneration && getCurrentUser().id === account;
    void privateApi<PreferenceResponse>("/notification-preferences", { signal: controller.signal }).then(result => {
      if (!validNotificationPreferences(result.preferences) || result.deliveryReady !== false) throw new Error("Invalid notification settings response. Check the backend deployment.");
      if (current()) setPreferences(result.preferences);
    }).catch(error => {
      if (current()) setError(error instanceof Error ? error.message : "Unable to load notification settings.");
    }).finally(() => { if (current()) setLoading(false); });
    const reset = () => {
      generation.current++; controller.abort(); busy.current = false;
      setPreferences(null); setSaving(false); setError(""); setLoading(true); setPermission(notificationPermission()); setAttempt(value => value + 1);
    };
    const focus = () => {
      setPermission(notificationPermission());
      if (!busy.current) setAttempt(value => value + 1);
    };
    window.addEventListener("storage", reset);
    window.addEventListener("allert-session-changed", reset);
    window.addEventListener("focus", focus);
    return () => {
      active = false; mounted.current = false; controller.abort();
      window.removeEventListener("storage", reset);
      window.removeEventListener("allert-session-changed", reset);
      window.removeEventListener("focus", focus);
    };
  }, [attempt]);

  async function changeEnabled(enabled: boolean) {
    if (!preferences || loading || busy.current) return false;
    const account = getCurrentUser().id;
    const currentGeneration = generation.current;
    const current = () => mounted.current && generation.current === currentGeneration && getCurrentUser().id === account;
    busy.current = true; setSaving(true); setError("");
    try {
      if (enabled) {
        // Request permission synchronously from this user action, ahead of authentication/network awaits.
        const granted = await requestNotificationPermission();
        if (!current()) return false;
        setPermission(notificationPermission());
        if (granted !== "granted") throw new Error(granted === "denied"
          ? "Notification permission was denied. Your saved preference was not changed."
          : "Notification permission was not granted. Your saved preference was not changed.");
      }
      if (!current()) return false;
      if (enabled === preferences.enabled) return true;
      const result = await privateApi<PreferenceResponse>("/notification-preferences", {
        method: "PUT", body: { enabled, revision: preferences.revision },
      });
      if (!current()) return false;
      if (!validNotificationPreferences(result.preferences) || result.deliveryReady !== false) throw new Error("Invalid notification settings response. Refresh settings.");
      setPreferences(result.preferences);
      return true;
    } catch (error) {
      if (current()) setError(error instanceof Error ? error.message : "Unable to save notification preference.");
      return false;
    } finally {
      if (current()) { busy.current = false; setSaving(false); }
    }
  }

  return {
    enabled: preferences?.enabled ?? false, permission, loading, saving, error,
    toggleDisabled: loading || saving || !preferences || (!preferences.enabled && ["unsupported", "insecure"].includes(permission)),
    status: loading ? "Loading notification preference…" : saving ? "Saving notification preference…" :
      !preferences ? "Notification settings unavailable." : notificationStatus(preferences.enabled, permission),
    changeEnabled, retry: () => { if (!busy.current) setAttempt(value => value + 1); },
  };
}
