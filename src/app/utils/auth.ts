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
}

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  const token = localStorage.getItem("allert_auth_token");
  return !!token;
};

// Get auth token
export const getAuthToken = (): string | null => {
  return localStorage.getItem("allert_auth_token");
};

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
  localStorage.removeItem("allert_auth_token");
  localStorage.removeItem("allert_user_id");
  localStorage.removeItem("allert_user_email");
  localStorage.removeItem("allert_user_name");
  localStorage.removeItem("allert_onboarding_complete");
  localStorage.removeItem("allert_demographic");
};

// Save patient profile to Supabase
export const saveProfile = async (
  demographic: "adult" | "pediatric",
  name?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const token = getAuthToken();
    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/profile`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ demographic, name }),
      }
    );

    const data = await response.json();

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
    const token = getAuthToken();
    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/profile`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

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
  notes?: string
): Promise<{ success: boolean; entry?: HealthLogEntry; error?: string }> => {
  try {
    const token = getAuthToken();
    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/health-logs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vasScore, tnssScore, riskLevel, notes }),
      }
    );

    const data = await response.json();

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
    const token = getAuthToken();
    if (!token) {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(
      `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/health-logs`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to fetch health logs");
    }

    return { success: true, logs: data.logs };
  } catch (error: any) {
    console.error("Health logs fetch error:", error);
    return { success: false, error: error.message };
  }
};
