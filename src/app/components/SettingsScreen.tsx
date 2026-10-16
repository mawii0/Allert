import { AdminAccessLink } from "./AdminLiveTools";
import { AppInstallation } from "./AppInstallation";
import { NodeLocationControls } from "./NodeLocationControls";
import { useNodeTelemetry } from "../utils/useNodeTelemetry";
import { useNavigate } from "react-router";
import {
  Cpu,
  Database,
  MapPin,
  Bell,
  Info,
  Activity,
  Clock,
  CheckCircle2,
  LogOut,
  Zap,
} from "lucide-react";
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
  const {
  device,
  latest,
  loading: nodeLoading,
  error: nodeError,
  nodeStatus,
  lastReading,
  retry,
} = useNodeTelemetry();

  const { data: monitor, status: monitorStatus } = useRiskMonitor();
  // Only display verified model metadata; device health is unavailable without telemetry.
  const systemData = {
  nodeId: device?.device_id || "Unassigned",
  uptime: "Not available",
  lastSync: lastReading,
  algorithmVersion: monitor?.model_id || "No neural output available",
  modelAccuracy: "See model validation report",
  dataPoints: latest
    ? `${latest.sample_count ?? "—"} / ${latest.expected_samples ?? "—"} samples in latest block`
    : "No readings yet",
};

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const formatJoinDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };


  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="text-sm text-zinc-400 mb-1">System Status & Profile</div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-zinc-400 mt-1">System health & configuration</p>
      </div>

      {/* User Profile Card */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        {isLoadingProfile ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 border-4 border-t-emerald-400 border-zinc-700 rounded-full animate-spin mx-auto mb-2" />
            <div className="text-sm text-zinc-400">Loading profile...</div>
          </div>
        ) : userProfile ? (
          <>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-2xl font-bold">
                {userProfile.demographic === "adult" ? "A" : "P"}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{userProfile.name || "Patient Profile"}</h3>
                <p className="text-sm text-zinc-400">
                  {userProfile.email}
                </p>
                <p className="text-xs text-zinc-500 capitalize mt-1">
                  {userProfile.demographic} • {userProfile.createdAt ? `Member since ${formatJoinDate(userProfile.createdAt)}` : "Profile loaded locally"}
                </p>
              </div>
            </div>

            <ProfileEditor settings={profileSettings} />

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </>
        ) : (
          <div className="text-center py-8 text-zinc-400">
            <p role="alert">{profileSettings.error || "Failed to load profile"}</p>
            <button type="button" onClick={profileSettings.retry} className="text-sm text-emerald-400 underline mt-3">Retry profile</button>
            <button type="button" onClick={handleLogout} className="w-full mt-4 flex items-center justify-center gap-2 py-3 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 transition-colors">
              <LogOut className="w-4 h-4" /><span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        )}
      </div>

       {/* Node Device Connection */}
      <div className="bg-zinc-900/50 rounded-2xl p-6 mb-6 border border-zinc-800">
        <div className="flex items-center gap-3 mb-4">
          <Zap className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="font-semibold">Node Device</h3>
            <p className="text-xs text-zinc-500">
              Sensor assigned to your account
            </p>
          </div>
        </div>

        <p className="text-sm mb-4">{nodeStatus}</p>

        {nodeError && (
          <p role="alert" className="text-sm text-red-400 mb-4">
            {nodeError}
            {device ? " Previously fetched device details are shown below." : ""}
          </p>
        )}

        {device && (
          <dl className="space-y-3 mb-5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Node ID</dt>
              <dd className="font-mono">{device.device_id}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Location</dt>
              <dd>{device.location_label || "Home"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-400">Last reading</dt>
              <dd className="text-right">{lastReading} (Iloilo local time)</dd>
            </div>
          </dl>
        )}

        {!device && !nodeLoading && !nodeError && (
          <p className="text-sm text-zinc-400 mb-4">
            No active node is assigned to this account.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={retry}
            disabled={nodeLoading}
            variant="outline"
          >
            {nodeLoading ? "Checking…" : "Check Node"}
          </Button>

          {device ? (
            <Button
              onClick={() => navigate("/app/environmental")}
              className="bg-emerald-600"
            >
              View Sensor Readings
            </Button>
          ) : (
            <Button
              onClick={() => navigate("/device-connection")}
              className="bg-purple-600"
            >
              Node Setup
            </Button>
          )}
        </div>
        {device && (
          <Button onClick={() => navigate("/device-connection")}
            variant="outline" className="w-full mt-4">
            Node Setup & Wi-Fi Instructions
          </Button>
        )}
      </div>

      {/* Sensor Node Status */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
            <Database className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold">Sensor Node Status</h3>
            <p className="text-xs text-zinc-500">{nodeStatus}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-400">Node ID</span>
            </div>
            <span className="text-sm font-medium">{systemData.nodeId}</span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-400">Uptime</span>
            </div>
            <span className="text-sm font-medium text-emerald-400">
              {systemData.uptime}
            </span>
          </div>

          <div className="flex justify-between items-center py-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-400">Last Reading</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{systemData.lastSync}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Algorithm Information */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold">LSTM Prediction Model</h3>
            <p className="text-xs text-zinc-500">PM2.5 and PM10 forecasting</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-zinc-800">
            <span className="text-sm text-zinc-400">Algorithm Version</span>
            <span className="text-sm font-mono font-medium bg-zinc-800 px-2 py-1 rounded">
              {systemData.algorithmVersion}
            </span>
          </div>

          <div className="flex justify-between items-center py-2 border-b border-zinc-800">
            <span className="text-sm text-zinc-400">Validation</span>
            <span className="text-sm font-medium text-emerald-400">
              {systemData.modelAccuracy}
            </span>
          </div>

          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-zinc-400">Live Readings</span>
            <span className="text-sm font-medium">{systemData.dataPoints}</span>
          </div>
        </div>

        <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-300">
              Environmental forecasting model. Twelve supplied reference cases passed cloud verification; this does not establish clinical accuracy.
            </p>
          </div>
        </div>
      </div>

      {/* Permissions & Notifications */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="font-semibold">Permissions</h3>
            <p className="text-xs text-zinc-500">App access controls</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium">Push Notifications</div>
              <div className="text-xs text-zinc-500 max-w-[230px]">{notifications.status}</div>
            </div>
            <Switch
              disabled={notifications.toggleDisabled}
              aria-label="Push notifications"
              checked={notifications.enabled}
              onCheckedChange={value => { void notifications.changeEnabled(value); }}
            />
          </div>
          {notifications.enabled && notifications.permission === "default" && <button type="button" disabled={notifications.loading || notifications.saving} onClick={() => { void notifications.changeEnabled(true); }} className="text-xs text-emerald-400 underline disabled:opacity-50">Allow in this browser</button>}
          {notifications.error && <p role="alert" className="text-xs text-red-300">{notifications.error}</p>}
          <button type="button" disabled={notifications.loading || notifications.saving} onClick={notifications.retry} className="text-xs text-zinc-400 underline disabled:opacity-50">Refresh notification settings</button>
          <BrowserPushControls enabled={notifications.enabled && !notifications.loading && !notifications.saving} />

          <div className="h-px bg-zinc-800" />

          <NodeLocationControls />
        </div>
      </div>

      {/* App Info */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800 shadow-xl">
        <div className="text-center text-sm text-zinc-500 space-y-1">
          <div className="flex items-center justify-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="font-medium text-emerald-400">{nodeStatus}</span>
          </div>
          <div>ALLERT System • Version 1.1.0</div>
          <AdminAccessLink />
          <AppInstallation />
          <div>Model: {monitor?.model_status?.replaceAll("_", " ") || (monitorStatus === "loading" ? "Checking…" : "Unavailable")}</div>
          <div>Allergic Rhinitis Environmental Monitoring</div>
          <div className="text-xs pt-2">© 2026 Research Prototype</div>
        </div>
      </div>
    </div>
  );
}
