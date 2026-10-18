import { useEffect, useRef, useState } from "react";
import { getCurrentUser, getProfile, saveProfile, type UserProfile } from "./auth";

type Population = UserProfile["demographic"];
const storedPopulation = (): Population => localStorage.getItem("allert_demographic") === "pediatric" ? "pediatric" : "adult";

// Both categories already exist in the monitor response. Switch the displayed category immediately.
export function useProfilePopulation() {
  const [population, setPopulation] = useState(storedPopulation);
  useEffect(() => {
    let active = true;
    let controller: AbortController | undefined;
    const sync = () => setPopulation(storedPopulation());
    const refresh = () => {
      sync();
      controller?.abort();
      controller = new AbortController();
      if (getCurrentUser().id) void getProfile({ signal: controller.signal }).then(result => {
        if (active && result.success) sync();
      });
    };
    const storage = (event: StorageEvent) => {
      if (event.key === null || ["allert_demographic", "allert_user_id"].includes(event.key)) sync();
    };
    window.addEventListener("allert-profile-changed", sync);
    window.addEventListener("allert-session-changed", refresh);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", refresh);
    refresh();
    return () => {
      active = false; controller?.abort();
      window.removeEventListener("allert-profile-changed", sync);
      window.removeEventListener("allert-session-changed", refresh);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return population;
}

export function useProfileSettings() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [demographic, setDemographic] = useState<Population>("adult");
  const [confirmed, setConfirmed] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(false);
  const busy = useRef(false);
  const editingRef = useRef(false);
  const loadingRef = useRef(true);
  const request = useRef<AbortController>();

  useEffect(() => {
    let active = true;
    mounted.current = true;
    const version = ++generation.current;
    const account = getCurrentUser().id;
    const controller = new AbortController();
    request.current = controller;
    const current = () => active && version === generation.current && account === getCurrentUser().id;
    loadingRef.current = true;
    setLoading(true); setProfile(null); setError(""); setMessage("");
    void getProfile({ signal: controller.signal }).then(result => {
      if (!current()) return;
      if (!result.success || !result.profile) throw Error(result.error || "Unable to load your profile.");
      setProfile(result.profile);
    }).catch(error => {
      if (current()) setError(error instanceof Error ? error.message : "Unable to load your profile.");
    }).finally(() => {
      if (current()) { loadingRef.current = false; setLoading(false); }
    });
    const reset = () => {
      generation.current++; controller.abort(); busy.current = false; editingRef.current = false;
      setProfile(null); setName(""); setDemographic("adult"); setConfirmed(false); setStale(false);
      setEditing(false); setSaving(false); setLoading(true); setError(""); setMessage("");
      setAttempt(value => value + 1);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === "allert_user_id" || (event.key === "allert_auth_token" && !event.newValue)) reset();
      else if (["allert_demographic", "allert_user_name"].includes(event.key)) {
        if (busy.current) return;
        if (editingRef.current) {
          setStale(true); setError("Your profile changed in another tab. Cancel and reopen the editor to load the latest profile.");
        } else reset();
      }
    };
    const focus = () => { if (!busy.current && !editingRef.current && !loadingRef.current) reset(); };
    window.addEventListener("allert-session-changed", reset);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", focus);
    return () => {
      active = false; mounted.current = false; controller.abort();
      window.removeEventListener("allert-session-changed", reset);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", focus);
    };
  }, [attempt]);

  const categoryChanged = !!profile && demographic !== profile.demographic;
  const changed = !!profile && (name.trim() !== profile.name || categoryChanged);
  const validName = name.trim().length > 0 && name.trim().length <= 100;

  function begin() {
    if (!profile || loading || busy.current) return;
    setName(profile.name); setDemographic(profile.demographic); setConfirmed(false); setStale(false);
    setError(""); setMessage(""); editingRef.current = true; setEditing(true);
  }
  function cancel() {
    if (busy.current) return;
    editingRef.current = false; setEditing(false); setName(""); setConfirmed(false); setError("");
    if (stale) { setStale(false); setAttempt(value => value + 1); }
  }
  async function save() {
    if (!profile || !editingRef.current || busy.current || loading || stale) return false;
    if (!validName) { setError("Enter a display name between 1 and 100 characters."); return false; }
    if (categoryChanged && !confirmed) { setError("Confirm the category change before saving."); return false; }
    if (!changed) return false;
    const account = getCurrentUser().id;
    const version = generation.current;
    const current = () => mounted.current && version === generation.current && account === getCurrentUser().id;
    busy.current = true; setSaving(true); setError(""); setMessage("");
    try {
      const result = await saveProfile(demographic, name.trim(), { signal: request.current?.signal });
      if (!current()) return false;
      if (!result.success || !result.profile) throw Error(result.error || "The profile save could not be confirmed. Please refresh and check.");
      setProfile(result.profile); editingRef.current = false; setEditing(false); setName(""); setConfirmed(false);
      setMessage("Profile saved.");
      return true;
    } catch (error) {
      if (current()) setError(error instanceof Error ? error.message : "The profile save could not be confirmed. Please refresh and check.");
      return false;
    } finally {
      if (current()) { busy.current = false; setSaving(false); }
    }
  }
  return {
    profile, loading, saving, editing, name, demographic, confirmed, error, message, categoryChanged,
    canSave: changed && validName && (!categoryChanged || confirmed) && !saving && !loading && !stale,
    begin, cancel, save, setName, setConfirmed,
    setDemographic: (value: Population) => { setDemographic(value); setConfirmed(false); },
    retry: () => { if (!busy.current) setAttempt(value => value + 1); },
  };
}
