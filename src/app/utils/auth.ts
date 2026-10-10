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
    if (!response.ok) { if (response.status < 500) logout(); throw new Error("Session could not be renewed. Please sign in again."); }
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

// Save patient profile to Supabase
export const saveProfile = async (
  demographic: "adult" | "pediatric",
  name?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const token = await getValidAuthToken();
    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/profile`,
      {
        signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ demographic, name }),
      }
    );

    const data = await response.json();
    if (response.status === 401) logout();

    if (!response.ok) {
      throw new Error(data.error || "Failed to save profile");
    }

    return { success: true };
  } catch (error: any) {
    console.error("Profile save error:", error);
    return { success: false, error: error.message };
  }
};

// Get patient profile from Supabase
export const getProfile = async (): Promise<{
  success: boolean;
  profile?: UserProfile;
  error?: string;
}> => {
  try {
    const token = await getValidAuthToken();
    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/profile`,
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
      throw new Error(data.error || "Failed to fetch profile");
    }

    return { success: true, profile: data.profile };
  } catch (error: any) {
    console.error("Profile fetch error:", error);
    return { success: false, error: error.message };
  }
};

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
