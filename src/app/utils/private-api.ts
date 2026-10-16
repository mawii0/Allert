import { projectId, publicAnonKey } from "/utils/supabase/info";
import { getCurrentUser, getValidAuthToken, logout } from "./auth";

export async function privateApi<T>(path: string, options: { method?: string; body?: object; signal?: AbortSignal } = {}): Promise<T> {
  const account = getCurrentUser().id;
  let invalidated=false;
  const invalidate=()=>{invalidated=true;};
  const storage=(event:StorageEvent)=>{if(event.key===null || event.key==="allert_user_id" || event.key==="allert_auth_token" && !event.newValue)invalidate();};
  window.addEventListener("allert-session-changed",invalidate);window.addEventListener("storage",storage);
  try {
  const token = await getValidAuthToken();
  const checkAccount = () => {
    if (invalidated || !account || account !== getCurrentUser().id) throw new Error("Account changed. Refresh this screen.");
    if(options.signal?.aborted)throw Error("Request cancelled.");
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
  if (response.status === 401 && (typeof localStorage==="undefined" || localStorage.getItem("allert_auth_token")===token)) logout();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`Server returned HTTP ${response.status}. Check the backend deployment.`); }
  if (!response.ok) throw Object.assign(new Error(data?.error || `Request failed (HTTP ${response.status}).`),{status:response.status});
  return data as T;
  } finally {window.removeEventListener("allert-session-changed",invalidate);window.removeEventListener("storage",storage);}
}
