import { useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
} from "lucide-react";

type RiskTier = "low" | "moderate" | "high" | "very-high";
type TimeHorizon = "now" | "6h" | "12h" | "24h";

interface RiskData {
  tier: RiskTier;
  probability: number;
  guidance: string;
}

export function DashboardScreen() {
  const [selectedTime, setSelectedTime] =
    useState<TimeHorizon>("now");
  const [isCalculating, setIsCalculating] = useState(false);

  // Mock risk data for different time horizons
  const riskDataMap: Record<TimeHorizon, RiskData> = {
    now: {
      tier: "low",
      probability: 0.16,
      guidance:
        "Low Risk: Area is safe for activities. Continue regular routines.",
    },
    "6h": {
      tier: "moderate",
      probability: 0.42,
      guidance:
        "Moderate Risk: Consider limiting prolonged outdoor exposure. Monitor symptoms.",
    },
    "12h": {
      tier: "high",
      probability: 0.68,
      guidance:
        "High Risk: Outdoor exposure limitaion and preventive meas.",
    },
    "24h": {
      tier: "very-high",
      probability: 0.85,
      guidance:
        "Very High Risk: Minimize indoor activities. Stay in air-conditioned spaces.",
    },
  };

  const currentRisk = riskDataMap[selectedTime];

  const handleTimeSelect = (time: TimeHorizon) => {
    if (time === selectedTime) return;

    setIsCalculating(true);
    setTimeout(() => {
      setSelectedTime(time);
      setIsCalculating(false);
    }, 800);
  };

  const getTierColors = (tier: RiskTier) => {
    switch (tier) {
      case "low":
        return {
          bg: "from-emerald-950 to-zinc-950",
          dial: "from-emerald-400 to-emerald-600",
          shadow: "shadow-emerald-500/20",
          text: "text-emerald-300",
          border: "border-emerald-500/30",
        };
      case "moderate":
        return {
          bg: "from-yellow-950 to-zinc-950",
          dial: "from-yellow-400 to-yellow-600",
          shadow: "shadow-yellow-500/20",
          text: "text-yellow-300",
          border: "border-yellow-500/30",
        };
      case "high":
        return {
          bg: "from-orange-950 to-zinc-950",
          dial: "from-orange-400 to-orange-600",
          shadow: "shadow-orange-500/20",
          text: "text-orange-300",
          border: "border-orange-500/30",
        };
      case "very-high":
        return {
          bg: "from-red-950 to-zinc-950",
          dial: "from-red-400 to-red-600",
          shadow: "shadow-red-500/20",
          text: "text-red-300",
          border: "border-red-500/30",
        };
    }
  };

  const colors = getTierColors(currentRisk.tier);

  return (
    <motion.div
      className={`min-h-screen bg-gradient-to-b ${colors.bg} px-6 py-8 transition-colors duration-700`}
      key={currentRisk.tier}
    >
      {/* Header */}
      <div className="mb-8">
        <div className="text-sm text-zinc-400 mb-1">
          Predictive Dashboard
        </div>
        <h1 className="text-2xl font-bold">Risk Monitor</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Iloilo Node-01 • Live
        </p>
      </div>

      {/* Risk Gauge */}
      <div className="relative mb-8">
        <div className="relative w-64 h-64 mx-auto">
          {/* Background Circle */}
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="128"
              cy="128"
              r="110"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              className="text-zinc-800/50"
            />
            {/* Progress Circle */}
            <motion.circle
              cx="128"
              cy="128"
              r="110"
              stroke="url(#gradient)"
              strokeWidth="12"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 110}`}
              initial={{ strokeDashoffset: 2 * Math.PI * 110 }}
              animate={{
                strokeDashoffset:
                  2 *
                  Math.PI *
                  110 *
                  (1 - currentRisk.probability),
              }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
            <defs>
              <linearGradient
                id="gradient"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop
                  offset="0%"
                  className={colors.text.replace(
                    "text-",
                    "stop-",
                  )}
                />
                <stop
                  offset="100%"
                  className={colors.text.replace(
                    "text-",
                    "stop-",
                  )}
                />
              </linearGradient>
            </defs>
          </svg>

          {/* Center Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {isCalculating ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center"
              >
                <div className="w-12 h-12 border-4 border-t-emerald-400 border-zinc-700 rounded-full animate-spin mb-2 mx-auto" />
                <div className="text-sm text-zinc-400">
                  Calculating...
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="text-center"
              >
                <div
                  className={`text-5xl font-bold ${colors.text} mb-1`}
                >
                  {Math.round(currentRisk.probability * 100)}%
                </div>
                <div className="text-sm text-zinc-400 uppercase tracking-wider">
                  {currentRisk.tier.replace("-", " ")}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Risk Probability
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Forecast Slider */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-4 mb-6 border border-zinc-800 shadow-xl">
        <div className="text-sm text-zinc-400 mb-3">
          Forecast Timeline
        </div>
        <div className="grid grid-cols-4 gap-2">
          {(["now", "6h", "12h", "24h"] as TimeHorizon[]).map(
            (time) => (
              <button
                key={time}
                onClick={() => handleTimeSelect(time)}
                disabled={isCalculating}
                className={`py-3 px-2 rounded-lg text-sm font-medium transition-all ${
                  selectedTime === time
                    ? `${colors.text} bg-gradient-to-br ${colors.dial} ${colors.shadow} shadow-lg`
                    : "text-zinc-400 bg-zinc-800/50 hover:bg-zinc-700/50"
                } ${isCalculating ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {time === "now" ? "Now" : `+${time}`}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Preventive Guidance Card */}
      <motion.div
        key={currentRisk.guidance}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`bg-zinc-900/80 backdrop-blur-md rounded-2xl p-5 border ${colors.border} shadow-xl`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-full bg-gradient-to-br ${colors.dial} flex items-center justify-center flex-shrink-0 ${colors.shadow}`}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold mb-1">
              ARIA Recommendations
            </h3>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {currentRisk.guidance}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 mt-6">
        <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-4 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">
            PM 2.5
          </div>
          <div className="text-lg font-bold">
            45{" "}
            <span className="text-xs text-zinc-400">μg/m³</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-yellow-400 mt-1">
            <TrendingUp className="w-3 h-3" />
            <span>Rising</span>
          </div>
        </div>
        <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-4 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">Temp</div>
          <div className="text-lg font-bold">
            28 <span className="text-xs text-zinc-400">°C</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-yellow-400 mt-1">
            <TrendingUp className="w-3 h-3" />
            <span>Rising</span>
          </div>
        </div>
        <div className="bg-zinc-900/50 backdrop-blur-sm rounded-xl p-4 border border-zinc-800">
          <div className="text-xs text-zinc-500 mb-1">
            Humidity
          </div>
          <div className="text-lg font-bold">
            72 <span className="text-xs text-zinc-400">%</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-zinc-400 mt-1">
            <Minus className="w-3 h-3" />
            <span>Stable</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}