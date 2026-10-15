import { useEffect, useState } from "react";
import { getCurrentUser } from "./auth";
import { getSensorTelemetry, type SensorTelemetry } from "./telemetry";
import { readingStatus } from "./node-status.mjs";
export function useNodeTelemetry() {
  const [telemetry, setTelemetry] = useState<SensorTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      const requestController = controller;
      const account = getCurrentUser().id;
      try {
        const result = await getSensorTelemetry(requestController.signal);
        if (active && controller === requestController && !requestController.signal.aborted && getCurrentUser().id === account) {
          setTelemetry(result); setError("");
        }
      } catch (err) {
        if (active && controller === requestController && !requestController.signal.aborted) {
          setTelemetry(null);
          setError(err instanceof Error ? err.message : "Unable to check your node.");
        }
      } finally {
        if (active && controller === requestController && !requestController.signal.aborted) {
          setLoading(false); setNow(Date.now());
          timer = setTimeout(refresh, 30_000);
        }
      }
    }
    const reset = () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      controller = new AbortController();
      setTelemetry(null); setError(""); setLoading(true);
      void refresh();
    };
    const changed = (event: StorageEvent) => { if (!event.key || event.key.startsWith("allert_")) reset(); };
    window.addEventListener("storage", changed);
    window.addEventListener("allert-session-changed", reset);
    window.addEventListener("allert-node-changed", reset);
    void refresh();
    return () => {
      active = false; controller.abort();
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener("storage", changed);
      window.removeEventListener("allert-session-changed", reset);
      window.removeEventListener("allert-node-changed", reset);
    };
  }, [revision]);
  const device = telemetry?.device ?? null;
  const latest = telemetry?.latest ?? null;
  const nodeStatus = readingStatus(telemetry, loading, error, now);
  const time = latest ? Date.parse(latest.timestamp) : NaN;
  const lastReading = Number.isFinite(time)
    ? new Date(time).toLocaleString("en-PH", { timeZone: "Asia/Manila" }) : "No readings yet";
  function retry() { setLoading(true); setRevision(value => value + 1); }
  return { device, latest, loading, error, nodeStatus, lastReading, retry };
}
