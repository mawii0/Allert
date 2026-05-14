import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Cpu,
  Database,
  MapPin,
  User,
  Bell,
  Palette,
  Info,
  ChevronRight,
  Activity,
  Clock,
  CheckCircle2,
  LogOut,
  Wifi,
  Zap,
} from "lucide-react";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { logout, getCurrentUser, getProfile, type UserProfile } from "../utils/auth";

export function SettingsScreen() {
  const navigate = useNavigate();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [nodeConnected, setNodeConnected] = useState(false);
  const [nodeId, setNodeId] = useState("");
  const [nodeNetwork, setNodeNetwork] = useState("");

  // Mock system data
  const systemData = {
    nodeId: "Iloilo-01",
    uptime: "99.8%",
    lastSync: "2 minutes ago",
    algorithmVersion: "v2.4.1",
    modelAccuracy: "94.2%",
    dataPoints: "156,432",
  };

  // Load user profile from Supabase
  useEffect(() => {
    const loadProfile = async () => {
      setIsLoadingProfile(true);
      try {
        const result = await getProfile();
        if (result.success && result.profile) {
          setUserProfile(result.profile);
        } else {
          console.error("Failed to load profile:", result.error);
          // Fallback to localStorage
          const localUser = getCurrentUser();
          if (localUser.id) {
            setUserProfile({
              userId: localUser.id,
              email: localUser.email || "",
              name: localUser.name || "",
              demographic: (localStorage.getItem("allert_demographic") as "adult" | "pediatric") || "adult",
              createdAt: new Date().toISOString(),
            });
          }
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadProfile();

    // Check node connection status
    const connected = localStorage.getItem("allert_node_connected") === "true";
    setNodeConnected(connected);
    if (connected) {
      setNodeId(localStorage.getItem("allert_node_id") || "");
      setNodeNetwork(localStorage.getItem("allert_node_network") || "");
    }
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const formatJoinDate = (isoDate: string) => {
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const handleDisconnectNode = () => {
    if (confirm("Are you sure you want to disconnect your Node device?")) {
      localStorage.removeItem("allert_node_connected");
      localStorage.removeItem("allert_node_id");
      localStorage.removeItem("allert_node_network");
      setNodeConnected(false);
      setNodeId("");
      setNodeNetwork("");
    }
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
                  {userProfile.demographic} • Member since {formatJoinDate(userProfile.createdAt)}
                </p>
              </div>
            </div>

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
            Failed to load profile
          </div>
        )}
      </div>

      {/* Node Device Connection */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold">Node Device</h3>
            <p className="text-xs text-zinc-500">Connect your sensor node</p>
          </div>
        </div>

        {nodeConnected ? (
          <div className="space-y-4">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-sm font-medium text-emerald-400">Connected</span>
                </div>
                <span className="text-xs text-zinc-500">Just now</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Node ID</span>
                  <span className="font-mono">{nodeId}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Network</span>
                  <div className="flex items-center gap-1">
                    <Wifi className="w-3 h-3 text-purple-400" />
                    <span>{nodeNetwork}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => navigate("/app/dashboard")}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
              >
                View Live Data
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
              <Button
                onClick={handleDisconnectNode}
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-zinc-400 mb-4">
              No device connected. Connect your Node to start monitoring.
            </p>
            <Button
              onClick={() => navigate("/device-connection")}
              className="w-full bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
            >
              <Zap className="w-4 h-4 mr-2" />
              Connect Node Device
            </Button>
          </div>
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
            <p className="text-xs text-zinc-500">Real-time connection status</p>
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
              <span className="text-sm text-zinc-400">Last Sync</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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
            <p className="text-xs text-zinc-500">Research-grade forecasting</p>
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
            <span className="text-sm text-zinc-400">Model Accuracy</span>
            <span className="text-sm font-medium text-emerald-400">
              {systemData.modelAccuracy}
            </span>
          </div>

          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-zinc-400">Training Data Points</span>
            <span className="text-sm font-medium">{systemData.dataPoints}</span>
          </div>
        </div>

        <div className="mt-4 bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-300">
              Model validated using Spearman's correlation coefficient with clinical ground truth data.
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
              <div className="text-xs text-zinc-500">Anomaly alerts & risk warnings</div>
            </div>
            <Switch
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
            />
          </div>

          <div className="h-px bg-zinc-800" />

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium">Location Services</div>
              <div className="text-xs text-zinc-500">Sensor node proximity mapping</div>
            </div>
            <Switch
              checked={locationEnabled}
              onCheckedChange={setLocationEnabled}
            />
          </div>
        </div>
      </div>

      {/* App Info */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800 shadow-xl">
        <div className="text-center text-sm text-zinc-500 space-y-1">
          <div className="flex items-center justify-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="font-medium text-emerald-400">System Operational</span>
          </div>
          <div>ALLERT System • Version 1.0.0</div>
          <div>Allergic Rhinitis Environmental Monitoring</div>
          <div className="text-xs pt-2">© 2026 Research Prototype</div>
        </div>
      </div>
    </div>
  );
}
