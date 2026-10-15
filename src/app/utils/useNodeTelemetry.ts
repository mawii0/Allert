import { useEffect, useState } from "react";
import { getSensorTelemetry, type SensorTelemetry } from "./telemetry";

export function useNodeTelemetry() {
  const [telemetry, setTelemetry] = useState<SensorTelemetry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const result = await getSensorTelemetry(controller.signal);

        if (!controller.signal.aborted) {
          setTelemetry(result);
          setError("");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Unable to check your node.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setNow(Date.now());
          timer = setTimeout(refresh, 30_000);
        }
      }
    }

    void refresh();

    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [revision]);

  const device = telemetry?.device ?? null;
  const latest = telemetry?.latest ?? null;
  const age = latest ? now - Date.parse(latest.timestamp) : null;
  const recent = age !== null && age >= 0 && age <= 10 * 60 * 1000;

  const nodeStatus = error
    ? "Unable to check node"
    : loading
      ? "Checking node…"
      : !device
        ? "No assigned node"
        : !latest
          ? "Waiting for first reading"
          : recent
            ? "Recent data"
            : "No recent data";

  const lastReading = latest
    ? new Date(latest.timestamp).toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
      })
    : "No readings yet";

  function retry() {
    setLoading(true);
    setRevision((value) => value + 1);
  }

  return {
    device,
    latest,
    loading,
    error,
    nodeStatus,
    lastReading,
    retry,
  };
}