import { useEffect, useState } from "react";
import { privateApi } from "./private-api";
import type { ForecastResponse, HistoryBlock, RiskResponse } from "./model-contract";

export interface EnvironmentSnapshot {
  node_id: string;
  mode: "live" | "historical_fixture";
  current: HistoryBlock;
  history?: HistoryBlock[];
  risk: RiskResponse;
  forecast: ForecastResponse;
}
export function useEnvironment() {
  const [snapshot, setSnapshot] = useState<EnvironmentSnapshot | null>(null);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setStatus("loading");
    setSnapshot(null);
    let active = true;
    let pending = false;
    let revision = 0;
    const controller = new AbortController();
    async function refresh() {
      if (pending) return;
      pending = true;
      const requestRevision = revision;
      try {
        const data = await privateApi<any>("/environment", {signal:controller.signal,timeoutMs:15000});
        if (active && revision === requestRevision) { setSnapshot(data.snapshot); setStatus(data.availability); }
      } catch (error) {
        if (active && revision === requestRevision) { setSnapshot(null); setStatus(error instanceof Error ? error.message : "unavailable"); }
      } finally { pending = false; if (active && revision !== requestRevision) void refresh(); }
    }
    const reset = () => { revision++; setSnapshot(null); setStatus("loading"); void refresh(); };
    window.addEventListener("storage", reset);
    window.addEventListener("allert-session-changed", reset);
    window.addEventListener("allert-node-changed", reset);
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("storage", reset); window.removeEventListener("allert-session-changed", reset);window.removeEventListener("allert-node-changed", reset); };
  }, [attempt]);
  return { snapshot, status, retry: () => setAttempt(value => value + 1) };
}
export const displayTime = (value: string) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila" });
