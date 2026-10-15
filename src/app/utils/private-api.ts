import { projectId, publicAnonKey } from "/utils/supabase/info";
import { getCurrentUser, getValidAuthToken, logout } from "./auth";

export async function privateApi<T>(path: string, options: { method?: string; body?: object; signal?: AbortSignal } = {}): Promise<T> {
  const account = getCurrentUser().id;
  const token = await getValidAuthToken();
  const checkAccount = () => {
    if (!account || account !== getCurrentUser().id) throw new Error("Account changed. Refresh this screen.");
  };
  if (!token) throw new Error("Please sign in.");
  checkAccount();
  const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-a473accf${path}`, {
    method: options.method || "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, apikey: publicAnonKey, ...(options.body && { "Content-Type": "application/json" }) },
    ...(options.body && { body: JSON.stringify(options.body) }),
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  checkAccount();
  if (response.status === 401) logout();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`Server returned HTTP ${response.status}. Check the backend deployment.`); }
  if (!response.ok) throw new Error(data?.error || `Request failed (HTTP ${response.status}).`);
  return data as T;
}
