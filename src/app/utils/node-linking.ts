import { privateApi } from "./private-api";
export interface NodeClaimResult { device_id: string; model_access_assigned: boolean; }
async function nodeAction(action: "claim" | "unlink", body: object) {
  const result = await privateApi<{ok:boolean;device_id:string;model_access_assigned:boolean;error?:string}>(`/nodes/${action}`, { method:"POST", body });
  if (result?.ok !== true) throw new Error(result?.error || "Unable to update node link.");
  window.dispatchEvent(new Event("allert-node-changed"));
  return result;
}
export async function claimNode(deviceId: string, setupCode: string): Promise<NodeClaimResult> {
  return nodeAction("claim", { device_id: deviceId, setup_code: setupCode });
}
export async function unlinkNode(deviceId: string): Promise<void> {
  await nodeAction("unlink", { device_id: deviceId });
}
