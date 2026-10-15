import { projectId, publicAnonKey } from "/utils/supabase/info";

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  demographic: "adult" | "pediatric";
  createdAt: string;
  updatedAt?: string;
}

export interface HealthLogEntry {
  id: string;
  userId: string;
  date: string;
  vasScore: number;
  tnssScore: number;
  riskLevel: number;
  notes?: string;
  symptomSeverities?: Record<string, number>;
  observedAt?: string;
}

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem("allert_auth_token");
  return !!token && (tokenIsCurrent(token) || !!localStorage.getItem("allert_refresh_token"));
};

// Get auth token
export const getAuthToken = (): string | null => {
  return localStorage.getItem("allert_auth_token");
};

function tokenIsCurrent(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now() + 30000;
  } catch { return false; }
}

export function storeSession(data: any) {
  const previousUser = localStorage.getItem("allert_user_id");
  if (previousUser !== data.user.id) logout();
  localStorage.setItem("allert_auth_token", data.access_token);
  if (data.refresh_token) localStorage.setItem("allert_refresh_token", data.refresh_token);
  localStorage.setItem("allert_user_id", data.user.id);
  localStorage.setItem("allert_user_email", data.user.email || "");
  // Token renewal must not overwrite a newer display name from the saved profile.
  if (previousUser !== data.user.id || localStorage.getItem("allert_user_name") === null)
    localStorage.setItem("allert_user_name", data.user.user_metadata?.name || "");
}

let refreshing: Promise<string | null> | null = null;
export async function getValidAuthToken(): Promise<string | null> {
  const token = getAuthToken();
  if (token && tokenIsCurrent(token)) return token;
  const refreshToken = localStorage.getItem("allert_refresh_token");
  if (!refreshToken) { if (token) logout(); return null; }
  if (!refreshing) refreshing = (async () => {
    const response = await fetch(`https://${projectId}.supabase.co/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: publicAnonKey },
      body: JSON.stringify({ refresh_token: refreshToken }), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) { if (response.status < 500 && localStorage.getItem("allert_refresh_token") === refreshToken) logout(); throw new Error("Session could not be renewed. Please sign in again."); }
    // A late refresh must never restore a session after logout or account switching.
    if (localStorage.getItem("allert_refresh_token") !== refreshToken) return null;
    storeSession(data);
    return data.access_token as string;
  })().finally(() => { refreshing = null; });
  return refreshing;
}

// Get current user info from localStorage
export const getCurrentUser = () => {
  return {
    id: localStorage.getItem("allert_user_id"),
    email: localStorage.getItem("allert_user_email"),
    name: localStorage.getItem("allert_user_name"),
  };
};

// Logout user
export const logout = () => {
  Object.keys(localStorage).filter(key => key.startsWith("allert_")).forEach(key => localStorage.removeItem(key));
  window.dispatchEvent(new Event("allert-session-changed"));
};

interface ProfileOptions { signal?: AbortSignal; }
interface ProfileResult { success: boolean; profile?: UserProfile; error?: string; }
let profileWriteRevision = 0;

async function profileRequest(body: { demographic: UserProfile["demographic"]; name?: string } | undefined, options: ProfileOptions): Promise<ProfileResult> {
  const account = getCurrentUser().id;
  const writeRevision = body ? ++profileWriteRevision : profileWriteRevision;
  let invalidated = false;
  const invalidate = () => { invalidated = true; };
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === "allert_user_id" || (event.key === "allert_auth_token" && !event.newValue) ||
        (!body && ["allert_user_name", "allert_demographic"].includes(event.key))) invalidate();
  };
  const checkAccount = () => {
    if (invalidated || !account || account !== getCurrentUser().id) throw Error("Account changed. Please reload your profile.");
    if (options.signal?.aborted) throw Error("Profile request cancelled.");
  };
  window.addEventListener("allert-session-changed", invalidate);
  window.addEventListener("storage", storage);
  try {
    const token = await getValidAuthToken();
    checkAccount();
    if (!token) throw Error("Please sign in.");
    const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-a473accf/profile`, {
      method: body ? "POST" : "GET", cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey, ...(body && { "Content-Type": "application/json" }) },
      ...(body && { body: JSON.stringify(body) }),
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    checkAccount();
    // An old request must not sign out a newer session, including a renewed token.
    if (response.status === 401 && getAuthToken() === token) logout();
    let data;
    try { data = JSON.parse(raw); } catch { throw Error(`Profile endpoint returned HTTP ${response.status}. Check the backend deployment.`); }
    if (!response.ok) throw Error(typeof data?.error === "string" ? data.error : `Profile request failed (HTTP ${response.status}).`);
    const profile = data?.profile;
    if (!profile || profile.userId !== account || typeof profile.name !== "string" || profile.name.length > 100 ||
        typeof profile.email !== "string" || !["adult", "pediatric"].includes(profile.demographic) ||
        typeof profile.createdAt !== "string" || !Number.isFinite(Date.parse(profile.createdAt)))
      throw Error("Invalid profile response. Refresh and check the backend deployment.");
    checkAccount();
    if (!body && writeRevision !== profileWriteRevision) throw Error("Profile changed while loading. Please refresh your profile.");
    const changed = localStorage.getItem("allert_user_name") !== profile.name || localStorage.getItem("allert_demographic") !== profile.demographic;
    if (body) profileWriteRevision++;
    localStorage.setItem("allert_user_name", profile.name);
    localStorage.setItem("allert_demographic", profile.demographic);
    if (changed) window.dispatchEvent(new Event("allert-profile-changed"));
    return { success: true, profile };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "The profile request could not be confirmed. Refresh and check your profile." };
  } finally {
    window.removeEventListener("allert-session-changed", invalidate);
    window.removeEventListener("storage", storage);
  }
}

// Existing onboarding/login callers retain the same API; editing can also use the saved profile.
export const saveProfile = (demographic: UserProfile["demographic"], name?: string, options: ProfileOptions = {}): Promise<ProfileResult> => {
  if (!["adult", "pediatric"].includes(demographic) || (name !== undefined && (typeof name !== "string" || name.trim().length > 100)))
    return Promise.resolve({ success: false, error: "Enter a valid name (at most 100 characters) and patient category." });
  return profileRequest({ demographic, ...(name !== undefined && { name: name.trim() }) }, options);
};

export const getProfile = (options: ProfileOptions = {}): Promise<ProfileResult> => profileRequest(undefined, options);

// Save health log entry to Supabase
export const saveHealthLog = async (
  vasScore: number,
  tnssScore: number,
  riskLevel: number,
  notes?: string,
  symptomSeverities?: Record<string, number>,
  observedAt?: string,
  requestId?: string,
): Promise<{ success: boolean; entry?: HealthLogEntry; error?: string }> => {
  try {
    const token = await getValidAuthToken();
    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/health-logs`,
      {
        signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vasScore, tnssScore, riskLevel, notes, symptomSeverities, observedAt, requestId }),
      }
    );

    const data = await response.json();
    if (response.status === 401) logout();

    if (!response.ok) {
      throw new Error(data.error || "Failed to save health log");
    }

    return { success: true, entry: data.entry };
  } catch (error: any) {
    console.error("Health log save error:", error);
    return { success: false, error: error.message };
  }
};

// Get health logs from Supabase
export const getHealthLogs = async (): Promise<{
  success: boolean;
  logs?: HealthLogEntry[];
  error?: string;
}> => {
  try {
    const token = await getValidAuthToken();
    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/health-logs`,
      {
        signal: AbortSignal.timeout(15000),
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();
    if (response.status === 401) logout();

    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch health logs");
    }

    return { success: true, logs: data.logs };
  } catch (error: any) {
    console.error("Health logs fetch error:", error);
    return { success: false, error: error.message };
  }
};
