import { projectId, publicAnonKey } from "/utils/supabase/info";
import { getValidAuthToken, getCurrentUser, logout } from "./auth";
export interface NodeClaimResult { device_id: string; model_access_assigned: boolean; }
async function nodeAction(action: "claim" | "unlink", body: object) {
  const account = getCurrentUser().id;
  const token = await getValidAuthToken();
  if (!token) throw new Error("Please sign in.");
  if (!account || getCurrentUser().id !== account) throw new Error("Account changed. Try again.");
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/nodes/${action}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: publicAnonKey },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20_000),
    },
  );
  if (getCurrentUser().id !== account) throw new Error("Account changed. Check the current account's node.");
  if (response.status === 401) logout();
  const raw = await response.text();
  let result;
  try { result = JSON.parse(raw); }
  catch { throw new Error(`Node endpoint returned HTTP ${response.status}. Check its deployment.`); }
  if (!response.ok || result?.ok !== true) throw new Error(result?.error || "Unable to update node link.");
  window.dispatchEvent(new Event("allert-node-changed"));
  return result;
}
export async function claimNode(deviceId: string, setupCode: string): Promise<NodeClaimResult> {
  return nodeAction("claim", { device_id: deviceId, setup_code: setupCode });
}
export async function unlinkNode(deviceId: string): Promise<void> {
  await nodeAction("unlink", { device_id: deviceId });
}
