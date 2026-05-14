import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { User, Users, MapPin, Bell, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { saveProfile, isAuthenticated } from "../utils/auth";
import logoImage from "../../imports/AllertLogoTransparent1.png";

export function OnboardingScreen() {
  const navigate = useNavigate();
  const [demographic, setDemographic] = useState<"adult" | "pediatric">("adult");
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Check authentication on mount
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/");
    }
  }, [navigate]);

  const handleComplete = async () => {
    setError("");
    setIsLoading(true);

    try {
      // Save profile to Supabase
      const userName = localStorage.getItem("allert_user_name") || "";
      const result = await saveProfile(demographic, userName);

      if (!result.success) {
        throw new Error(result.error || "Failed to save profile");
      }

      // Store onboarding data in localStorage
      localStorage.setItem("allert_onboarding_complete", "true");
      localStorage.setItem("allert_demographic", demographic);

      navigate("/app/dashboard");
    } catch (err: any) {
      console.error("Onboarding save error:", err);
      setError(err.message || "Failed to save profile. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="w-full max-w-md mx-auto min-h-screen bg-gradient-to-b from-emerald-950 to-zinc-950 px-6 py-12 flex flex-col">
        {/* Logo and Title */}
        <div className="text-center mb-12">
          <div className="mx-auto mb-4 w-full max-w-[130px]">
            {/* Adjust max-w-[96px] to change logo size */}
            <img
              src={logoImage}
              alt="Allert Logo"
              className="w-full h-auto"
              loading="eager"
              decoding="async"
            />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-[#ffffff]">Welcome to ALLERT</h1>
          <p className="text-zinc-400 text-sm">
            Allergic Rhinitis Monitoring System
          </p>
        </div>

      {/* Demographic Toggle */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <User className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-[#ffffff]">Patient Profile</h3>
            <p className="text-xs text-zinc-500">Select your age group</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setDemographic("adult")}
            className={`p-4 rounded-xl border transition-all ${
              demographic === "adult"
                ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                : "bg-zinc-800/50 border-zinc-700 text-zinc-400"
            }`}
          >
            <User className="w-6 h-6 mx-auto mb-2" />
            <div className="text-sm font-medium">Adult</div>
            <div className="text-xs opacity-70">Baseline: 0.20</div>
          </button>
          <button
            onClick={() => setDemographic("pediatric")}
            className={`p-4 rounded-xl border transition-all ${
              demographic === "pediatric"
                ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                : "bg-zinc-800/50 border-zinc-700 text-zinc-400"
            }`}
          >
            <Users className="w-6 h-6 mx-auto mb-2" />
            <div className="text-sm font-medium">Pediatric</div>
            <div className="text-xs opacity-70">Baseline: 0.22</div>
          </button>
        </div>
      </div>

      {/* Permissions */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-zinc-800 shadow-xl">
        <h3 className="font-semibold mb-4 text-[#ffffff]">Permissions</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-[#ffffff]">Location Services</div>
                <div className="text-xs text-zinc-500">
                  Map to nearest sensor node
                </div>
              </div>
            </div>
            <Switch
              checked={locationEnabled}
              onCheckedChange={setLocationEnabled}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Bell className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-[#ffffff]">Push Notifications</div>
                <div className="text-xs text-zinc-500">
                  Anomaly alerts & warnings
                </div>
              </div>
            </div>
            <Switch
              checked={notificationsEnabled}
              onCheckedChange={setNotificationsEnabled}
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

        {/* Continue Button */}
        <Button
          onClick={handleComplete}
          disabled={isLoading}
          className="w-full h-14 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Saving profile...
            </>
          ) : (
            <>
              Get Started
              <ChevronRight className="w-5 h-5 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
