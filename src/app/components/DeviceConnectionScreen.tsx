import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Cloud } from "lucide-react";
import { Button } from "./ui/button";
import { useNodeTelemetry } from "../utils/useNodeTelemetry";
import { claimNode } from "../utils/node-linking";

export function DeviceConnectionScreen() {
  const navigate = useNavigate();
  const { device, loading, error, nodeStatus, lastReading, retry } = useNodeTelemetry();
  const [deviceId, setDeviceId] = useState("ALLERT-NODE-001");
  const [setupCode, setSetupCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setClaimError("");
    setSuccess("");
    try {
      await claimNode(deviceId, setupCode);
      setSetupCode("");
      setSuccess("Node linked to your account. Model access is assigned too.");
      retry();
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Unable to link node.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white max-w-md mx-auto px-6 py-8">
      <button aria-label="Back to Settings" onClick={() => navigate("/app/settings")}
        className="mb-6 rounded-full bg-zinc-800 p-3">
        <ArrowLeft size={20} />
      </button>
      <p className="text-sm text-zinc-400 mb-1">Node Setup</p>
      <h1 className="text-2xl font-bold mb-6">Connect Node Device</h1>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <Cloud className="text-emerald-400" />
          <h2 className="font-semibold">{nodeStatus}</h2>
        </div>
        {error && <p role="alert" className="text-sm text-red-400 mb-4">{error}</p>}
        {device && <div className="space-y-2 text-sm">
          <p>Node: {device.device_id}</p>
          <p>Location: {device.location_label || "Home"}</p>
          <p>Last reading: {lastReading} (Manila)</p>
        </div>}
        <Button onClick={retry} disabled={loading || submitting} variant="outline" className="mt-4 w-full">
          {loading ? "Checking…" : "Check Assigned Node"}
        </Button>
        {device && <Button onClick={() => navigate("/app/environmental")}
          className="w-full mt-3 bg-emerald-600">View Sensor Readings</Button>}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 mb-5">
        <h2 className="font-semibold mb-2">{device ? "Verify Node Link" : "Link Your Node"}</h2>
        <p className="text-sm text-zinc-400 mb-4">
          Enter the private setup code supplied with your node. A node belonging
          to another account cannot be claimed here.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="node-id" className="block text-sm mb-2">Device ID</label>
            <input id="node-id" value={deviceId} onChange={e => setDeviceId(e.target.value)}
              required maxLength={100} disabled={submitting}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 p-3" />
          </div>
          <div>
            <label htmlFor="setup-code" className="block text-sm mb-2">Private setup code</label>
            <input id="setup-code" type="password" value={setupCode}
              onChange={e => setSetupCode(e.target.value)} required maxLength={100}
              autoComplete="off" spellCheck={false} disabled={submitting}
              placeholder="32-character code"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 p-3" />
          </div>
          {claimError && <p role="alert" className="text-sm text-red-400">{claimError}</p>}
          {success && <p role="status" className="text-sm text-emerald-400">{success}</p>}
          <Button type="submit" disabled={submitting || loading}
            className="w-full bg-purple-600">
            {submitting ? "Linking…" : device ? "Verify Node Link" : "Link Node"}
          </Button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="font-semibold mb-3">Set Up Node Wi-Fi</h2>
        <ol className="list-decimal pl-5 space-y-3 text-sm text-zinc-300">
          <li>Power on the node. If it cannot join its saved Wi-Fi, it opens its setup hotspot.</li>
          <li>Join the node's ALLERT-Setup Wi-Fi network using the password supplied with the node.</li>
          <li>Open http://192.168.4.1 in your browser and select Configure WiFi.</li>
          <li>Select your home Wi-Fi, enter its password and check the upload server address, then save.</li>
          <li>Reconnect your phone to your normal Wi-Fi and return to ALLERT.</li>
        </ol>
        <p className="text-xs text-zinc-400 mt-4">
          Wi-Fi setup requires the updated node firmware. Wi-Fi credentials are
          entered on the node's local setup page. Keep FastAPI running on the
          configured server to receive readings.
        </p>
      </section>
    </div>
  );
}
