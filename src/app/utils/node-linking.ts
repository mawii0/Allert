import { projectId, publicAnonKey } from "/utils/supabase/info";
import { getAuthToken } from "./auth";

export async function claimNode(deviceId: string, setupCode: string): Promise<void> {
  const token = getAuthToken();
  if (!token) throw new Error("Please sign in.");
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/nodes/claim`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: publicAnonKey,
      },
      body: JSON.stringify({ device_id: deviceId, setup_code: setupCode }),
    },
  );
  const raw = await response.text();
  let result;
  try { result = JSON.parse(raw); }
  catch { throw new Error(`Node linking endpoint returned HTTP ${response.status}. Check its deployment.`); }
  if (!response.ok || !result.ok) throw new Error(result.error || "Unable to link node.");
}
