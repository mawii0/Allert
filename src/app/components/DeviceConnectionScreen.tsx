import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Cloud } from "lucide-react";
import { Button } from "./ui/button";
import { useNodeTelemetry } from "../utils/useNodeTelemetry";
import { claimNode, unlinkNode } from "../utils/node-linking";

export function DeviceConnectionScreen() {
  const navigate = useNavigate();
  const { device, loading, error, nodeStatus, lastReading, retry } = useNodeTelemetry();
  const [deviceId, setDeviceId] = useState("ALLERT-NODE-001");
  const [setupCode, setSetupCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [confirmId, setConfirmId] = useState("");

  useEffect(() => { if (device?.device_id) setDeviceId(device.device_id); }, [device?.device_id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setClaimError("");
    setSuccess("");
    try {
      const result = await claimNode(deviceId, setupCode);
      setSetupCode("");
      setSuccess(result.model_access_assigned
        ? "Node linked to your account. Model access is assigned too."
        : "Node linked to your account. Sensor readings and median estimates are available; neural forecasting is not enabled for this node.");
      retry();
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Unable to link node.");
    } finally {
      setSubmitting(false);
    }
  }

  async function unlink() {
    if (!device || confirmId !== device.device_id || submitting) return;
    setSubmitting(true); setClaimError(""); setSuccess("");
    try {
      await unlinkNode(device.device_id);
      setSuccess("Node unlinked. A new setup code is required to link it again.");
      setConfirmUnlink(false); setConfirmId(""); retry();
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Unable to unlink node.");
    } finally { setSubmitting(false); }
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
          <p>Last reading: {lastReading} (Iloilo local time)</p>
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
              required maxLength={100} disabled={submitting || Boolean(device)}
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
          <li>Select your home Wi-Fi, enter its password and then save. For the first firmware check, keep the FastAPI upload address; after switching to cloud mode, the node uploads to Supabase.</li>
          <li>Reconnect your phone to your normal Wi-Fi and return to ALLERT.</li>
        </ol>
        <p className="text-xs text-zinc-400 mt-4">
          Wi-Fi setup requires the updated node firmware. Wi-Fi credentials are
          entered on the node's local setup page. FastAPI is needed in the initial
          Wi-Fi test mode. Cloud upload mode runs without your PC.
        </p>
        <p className="text-xs text-zinc-400 mt-3">If the node already joins Wi-Fi, send lowercase <code>s</code> in Serial Monitor to open setup. With the optional setup button fitted, hold it for three seconds.</p>
        <a href="http://192.168.4.1" className="block mt-4 text-sm text-emerald-400 underline">Open Node Wi-Fi Setup</a>
      </section>
      {device && <section className="rounded-2xl border border-red-900 bg-zinc-900/50 p-5 mt-5">
        <h2 className="font-semibold mb-2">Unlink Node</h2>
        <p className="text-sm text-zinc-400">Unlinking removes account access and does not turn off the node. Stored readings remain protected; a new owner starts with readings collected after their link.</p>
        {!confirmUnlink ? <Button variant="outline" className="mt-4 text-red-400" onClick={() => setConfirmUnlink(true)}>Unlink from Account</Button> : <div className="mt-4 space-y-3">
          <label htmlFor="confirm-unlink" className="block text-sm">Type {device.device_id} to confirm</label>
          <input id="confirm-unlink" value={confirmId} onChange={e => setConfirmId(e.target.value)} className="w-full rounded-lg bg-zinc-800 border border-zinc-700 p-3" disabled={submitting} />
          <div className="flex gap-2"><Button onClick={unlink} disabled={submitting || confirmId !== device.device_id} className="bg-red-700">{submitting ? "Unlinking…" : "Confirm Unlink"}</Button><Button variant="outline" onClick={() => setConfirmUnlink(false)} disabled={submitting}>Cancel</Button></div>
        </div>}
      </section>}
    </div>
  );
}
