import { useEffect, useState } from "react";
import { projectId } from "/utils/supabase/info";
import { getAuthToken } from "./auth";
import type { ForecastResponse, HistoryBlock, RiskResponse } from "./model-contract";

export interface EnvironmentSnapshot {
  node_id: string;
  mode: "live" | "historical_fixture";
  current: HistoryBlock;
  risk: RiskResponse;
  forecast: ForecastResponse;
}
export function useEnvironment() {
  const [snapshot, setSnapshot] = useState<EnvironmentSnapshot | null>(null);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const token = getAuthToken();
        if (!token) throw new Error("Sign in to read environmental data");
        const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-a473accf/environment`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Environmental data unavailable");
        if (active) { setSnapshot(data.snapshot); setStatus(data.availability); }
      } catch (error) {
        if (active) { setSnapshot(null); setStatus(error instanceof Error ? error.message : "unavailable"); }
      } finally { pending = false; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  return { snapshot, status };
}
export const displayTime = (value: string) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
