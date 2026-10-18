import "../../styles/patient-settings.css";
import { AdminAccessLink } from "./AdminLiveTools";
import { AppInstallation } from "./AppInstallation";
import { NodeLocationControls } from "./NodeLocationControls";
import { useNodeTelemetry } from "../utils/useNodeTelemetry";
import { useNavigate } from "react-router";
import { Bell, Cpu, MapPin, LogOut, UserRound, Radio } from "lucide-react";
import { useRiskMonitor } from "../utils/risk-monitor";
import { Switch } from "./ui/switch";
import { useNotificationPreferences } from "../utils/useNotificationPreferences";
import { BrowserPushControls } from "./BrowserPushControls";
import { Button } from "./ui/button";
import { logout } from "../utils/auth";
import { useProfileSettings } from "../utils/useProfileSettings";
import { ProfileEditor } from "./ProfileEditor";

export function SettingsScreen() {
  const navigate = useNavigate();
  const notifications = useNotificationPreferences();
  const profileSettings = useProfileSettings();
  const { profile: userProfile, loading: isLoadingProfile } = profileSettings;
  const { device, latest, loading: nodeLoading, error: nodeError, nodeStatus, lastReading, retry } = useNodeTelemetry();
  const { data: monitor, status: monitorStatus } = useRiskMonitor();
  const handleLogout = () => { logout(); navigate("/"); };
  const joinDate = userProfile?.createdAt ? new Date(userProfile.createdAt).toLocaleDateString("en-PH", { month: "long", year: "numeric" }) : null;

  return <div className="allert-ui settings-screen min-h-screen bg-zinc-950 px-4 py-8 sm:px-6">
    <header className="mb-6">
      <p className="allert-eyebrow">ALLERT · Your preferences</p>
      <h1 className="text-2xl font-bold mt-2">Settings</h1>
      <p className="text-sm text-zinc-400 mt-2">Manage your profile, home node, and notifications.</p>
    </header>
    <nav aria-label="Settings sections" className="allert-section-nav mb-6">
      <a href="#settings-profile">Profile</a><a href="#settings-node">Home node</a>
      <a href="#settings-notifications">Notifications</a><a href="#settings-location">Location</a>
    </nav>

    <section id="settings-profile" aria-labelledby="settings-profile-title" className="allert-card">
      <div className="allert-section-heading"><UserRound aria-hidden="true" /><div><h2 id="settings-profile-title">Your profile</h2><p>Choose the patient category used by Risk Monitor.</p></div></div>
      {isLoadingProfile ? <p role="status" className="text-sm text-zinc-300 py-4">Loading profile…</p> : userProfile ? <>
        <div className="flex items-start gap-3 mb-5">
          <div aria-hidden="true" className="w-12 h-12 shrink-0 rounded-2xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center font-bold">{userProfile.demographic === "adult" ? "A" : "P"}</div>
          <div className="min-w-0"><p className="font-semibold text-lg break-words">{userProfile.name || "Patient Profile"}</p>
            <p className="text-sm text-zinc-300 break-words">{userProfile.email}</p>
            <p className="text-xs text-zinc-400 mt-2">{userProfile.demographic === "adult" ? "Adult" : "Pediatric"}{joinDate ? ` · Member since ${joinDate}` : " · Profile loaded locally"}</p>
          </div>
        </div>
        <ProfileEditor settings={profileSettings} />
      </> : <div className="py-3"><p role="alert" className="text-sm text-red-300">{profileSettings.error || "Failed to load profile"}</p><button type="button" onClick={profileSettings.retry} className="allert-secondary mt-3">Retry profile</button></div>}
    </section>

    <section id="settings-node" aria-labelledby="settings-node-title" className="allert-card">
      <div className="allert-section-heading"><Radio aria-hidden="true" /><div><h2 id="settings-node-title">Home node</h2><p>Sensor Node Status</p></div></div>
      <p role="status" className="allert-state mb-4">{nodeLoading ? "Checking node…" : nodeStatus}</p>
      {nodeError && <p role="alert" className="text-sm text-red-300 mb-4">{nodeError}{device ? " Previously fetched device details are shown below." : ""}</p>}
      {device && <dl className="allert-data-list mb-5">
        <div><dt>Node ID</dt><dd className="font-mono">{device.device_id}</dd></div>
        <div><dt>Location</dt><dd>{device.location_label || "Home"}</dd></div>
        <div><dt>Last reading</dt><dd>{lastReading}<span className="block text-xs text-zinc-400 mt-1">Asia/Manila (UTC+8)</span></dd></div>
        <div><dt>Latest block</dt><dd>{latest ? `${latest.sample_count ?? "—"} / ${latest.expected_samples ?? "—"} samples` : "No readings yet"}</dd></div>
      </dl>}
      {!device && !nodeLoading && !nodeError && <p className="text-sm text-zinc-300 mb-4">No active node is assigned to this account. Link a node to start monitoring your home.</p>}
      <div className="allert-actions">
        <Button onClick={retry} disabled={nodeLoading} variant="outline">{nodeLoading ? "Checking…" : "Check Node"}</Button>
        <Button onClick={() => navigate(device ? "/app/environmental" : "/device-connection")} className="bg-emerald-600">{device ? "View Sensor Readings" : "Node Setup"}</Button>
      </div>
      {device && <Button onClick={() => navigate("/device-connection")} variant="outline" className="w-full mt-3 whitespace-normal">Node Setup &amp; Wi-Fi Instructions</Button>}
    </section>

    <section id="settings-notifications" aria-labelledby="settings-notifications-title" className="allert-card">
      <div className="allert-section-heading"><Bell aria-hidden="true" /><div><h2 id="settings-notifications-title">Notifications</h2><p>Choose what this browser can receive.</p></div></div>
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="min-w-0"><p id="push-preference-title" className="text-sm font-medium">Push Notifications</p><p id="push-preference-help" className="text-sm text-zinc-300 mt-1">{notifications.status}</p></div>
        <Switch disabled={notifications.toggleDisabled} aria-label="Push notifications" aria-describedby="push-preference-help" checked={notifications.enabled} onCheckedChange={value => { void notifications.changeEnabled(value); }} />
      </div>
      {notifications.enabled && notifications.permission === "default" && <button type="button" disabled={notifications.loading || notifications.saving} onClick={() => { void notifications.changeEnabled(true); }} className="allert-secondary mt-3">Allow in this browser</button>}
      {notifications.error && <p role="alert" className="text-sm text-red-300 mt-3">{notifications.error}</p>}
      <button type="button" disabled={notifications.loading || notifications.saving} onClick={notifications.retry} className="allert-text-action">Refresh notification settings</button>
      <BrowserPushControls enabled={notifications.enabled && !notifications.loading && !notifications.saving} />
      <button type="button" className="allert-text-action" onClick={() => navigate("/app/sensor-notices")}>View sensor notices</button>
    </section>

    <section id="settings-location" aria-labelledby="settings-location-title" className="allert-card">
      <div className="allert-section-heading"><MapPin aria-hidden="true" /><div><h2 id="settings-location-title">Node location</h2><p>Label where the sensor is installed.</p></div></div>
      <NodeLocationControls />
    </section>

    <section aria-labelledby="settings-about-title" className="allert-card">
      <div className="allert-section-heading"><Cpu aria-hidden="true" /><div><h2 id="settings-about-title">About ALLERT</h2><p>App installation and system information.</p></div></div>
      <AppInstallation />
      <details className="allert-disclosure mt-4"><summary>Model &amp; app details</summary><dl className="allert-data-list mt-3">
        <div><dt>Model status</dt><dd>{monitor?.model_status?.replaceAll("_", " ") || (monitorStatus === "loading" ? "Checking…" : "Unavailable")}</dd></div>
        <div><dt>Model version</dt><dd className="font-mono">{monitor?.model_id || "No neural output available"}</dd></div>
        <div><dt>App version</dt><dd>1.1.0</dd></div>
      </dl><p className="text-sm text-zinc-300 mt-4">Environmental forecasting model. Reference-case verification does not establish clinical accuracy.</p></details>
      <AdminAccessLink />
      <p className="text-xs text-zinc-400 mt-4">ALLERT · Allergic Rhinitis Environmental Monitoring<br />© 2026 Research Prototype</p>
    </section>
    <button type="button" onClick={handleLogout} className="allert-signout w-full flex items-center justify-center gap-2"><LogOut aria-hidden="true" className="w-4 h-4" />Logout</button>
  </div>;
}
