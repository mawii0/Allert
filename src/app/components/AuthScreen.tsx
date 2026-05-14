import { useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { DeploymentCheck } from "./DeploymentCheck";
import { projectId, publicAnonKey } from "/utils/supabase/info";
// import logoImage from "../../imports/AllertLogoTransparent.png";
import logoImage from "../../imports/AllertLogoTransparent1.png";


type AuthMode = "login" | "register";

export function AuthScreen() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuth = async () => {
    setError("");

    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }

    if (mode === "register" && !name) {
      setError("Please enter your name");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = mode === "register" ? "signup" : "login";
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-a473accf/${endpoint}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publicAnonKey}`,
        },
        body: JSON.stringify({
          email,
          password,
          ...(mode === "register" && { name }),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            `${mode === "register" ? "Registration" : "Login"} failed`,
        );
      }

      if (data.access_token) {
        localStorage.setItem("allert_auth_token", data.access_token);
        localStorage.setItem("allert_user_id", data.user.id);
        localStorage.setItem("allert_user_email", data.user.email);
        if (data.user.user_metadata?.name) {
          localStorage.setItem("allert_user_name", data.user.user_metadata.name);
        }

        const onboardingComplete = localStorage.getItem("allert_onboarding_complete");
        if (onboardingComplete === "true") {
          navigate("/app/dashboard");
        } else {
          navigate("/onboarding");
        }
      } else {
        throw new Error("No authentication token received");
      }
    } catch (err: any) {
      if (err.message === "Failed to fetch" || err instanceof TypeError) {
        setError(
          "Backend not deployed. See instructions above to deploy the edge function from Make settings.",
        );
      } else {
        setError(err.message || "Authentication failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAuth();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="w-full max-w-md mx-auto min-h-screen bg-gradient-to-b from-emerald-950 via-zinc-950 to-zinc-950 px-6 py-12 flex flex-col items-center justify-center">

        {/* Deployment Status Check */}
        <DeploymentCheck />

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="mx-auto mb-2 w-full max-w-[130px]">
            <img
              src={logoImage}
              alt="Allert Logo"
              className="w-full h-auto"
              loading="eager"
              decoding="async"
            />
          </div>
          <h1 className="text-3xl font-bold mb-2 text-white">ALLERT</h1>
          <p className="text-zinc-400 text-sm">Allergic Rhinitis Monitoring System</p>
        </motion.div>

        {/* Auth Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="w-full"
        >
          <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800 shadow-xl">

            {/* Mode Toggle */}
            <div className="grid grid-cols-2 gap-2 mb-6 bg-zinc-800/50 p-1 rounded-lg">
              <button
                onClick={() => {
                  setMode("login");
                  setError("");
                }}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  mode === "login"
                    ? "bg-emerald-500 text-white shadow-lg"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <LogIn className="w-4 h-4 inline-block mr-2" />
                Login
              </button>
              <button
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  mode === "register"
                    ? "bg-emerald-500 text-white shadow-lg"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <UserPlus className="w-4 h-4 inline-block mr-2" />
                Register
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === "login" ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === "login" ? 20 : -20 }}
                transition={{ duration: 0.2 }}
              >
                <div className="space-y-4">

                  {/* Name Field (Register Only) */}
                  {mode === "register" && (
                    <div>
                      <Label htmlFor="name" className="text-sm text-zinc-300 mb-2 block">
                        Full Name
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                        <Input
                          id="name"
                          type="text"
                          placeholder="John Doe"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          onKeyPress={handleKeyPress}
                          className="pl-11 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                          disabled={isLoading}
                        />
                      </div>
                    </div>
                  )}

                  {/* Email Field */}
                  <div>
                    <Label htmlFor="email" className="text-sm text-zinc-300 mb-2 block">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="pl-11 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div>
                    <Label htmlFor="password" className="text-sm text-zinc-300 mb-2 block">
                      Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyPress={handleKeyPress}
                        className="pl-11 bg-zinc-800/50 border-zinc-700 text-white placeholder:text-zinc-500"
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  {/* Error Message */}
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2"
                    >
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-300">{error}</p>
                    </motion.div>
                  )}

                  {/* Submit Button */}
                  <Button
                    onClick={handleAuth}
                    disabled={isLoading}
                    className="w-full h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        {mode === "login" ? "Signing in..." : "Creating account..."}
                      </>
                    ) : (
                      <>
                        {mode === "login" ? (
                          <>
                            <LogIn className="w-5 h-5 mr-2" />
                            Sign In
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-5 h-5 mr-2" />
                            Create Account
                          </>
                        )}
                      </>
                    )}
                  </Button>

                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Info Message */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-6 text-center text-xs text-zinc-500"
          >
            {mode === "login" ? (
              <p>Don't have an account? Switch to Register above</p>
            ) : (
              <p>Already have an account? Switch to Login above</p>
            )}
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}