import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Wind,
  Droplets,
  Thermometer,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
} from "lucide-react";
import { CustomSparkline } from "./CustomSparkline";

interface TelemetryCard {
  id: string;
  label: string;
  value: number;
  unit: string;
  icon: any;
  trend: "rising" | "stable" | "falling";
  color: string;
  data: { value: number }[];
}

export function EnvironmentalScreen() {
  const [showAnomaly, setShowAnomaly] = useState(true);

  // Mock 24-hour data
  const generateSparklineData = (baseValue: number, variance: number) => {
    return Array.from({ length: 24 }, (_, i) => ({
      value: baseValue + (Math.random() - 0.5) * variance,
    }));
  };

  const telemetryCards: TelemetryCard[] = [
    {
      id: "pm25",
      label: "PM 2.5",
      value: 45.2,
      unit: "μg/m³",
      icon: Wind,
      trend: "rising",
      color: "text-orange-400",
      data: generateSparklineData(45, 15),
    },
    {
      id: "pm10",
      label: "PM 10",
      value: 68.5,
      unit: "μg/m³",
      icon: Wind,
      trend: "rising",
      color: "text-orange-400",
      data: generateSparklineData(68, 20),
    },
    {
      id: "temp",
      label: "Temperature",
      value: 28.3,
      unit: "°C",
      icon: Thermometer,
      trend: "stable",
      color: "text-blue-400",
      data: generateSparklineData(28, 3),
    },
    {
      id: "humidity",
      label: "Humidity",
      value: 72,
      unit: "%",
      icon: Droplets,
      trend: "falling",
      color: "text-cyan-400",
      data: generateSparklineData(72, 10),
    },
  ];

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "rising":
        return TrendingUp;
      case "falling":
        return TrendingDown;
      default:
        return Minus;
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "rising":
        return "text-orange-400";
      case "falling":
        return "text-emerald-400";
      default:
        return "text-zinc-400";
    }
  };

  // Mock anomaly data - Z-score > 3.0
  const anomalyData = {
    detected: true,
    zScore: 3.4,
    pollutant: "PM 2.5",
    exceedPercentage: 42,
    timestamp: "2 minutes ago",
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="text-sm text-zinc-400 mb-1">Environmental Analytics</div>
        <h1 className="text-2xl font-bold">Sensor Telemetry</h1>
        <p className="text-sm text-zinc-400 mt-1">Real-time air quality monitoring</p>
      </div>

      {/* Anomaly Alert Banner */}
      <AnimatePresence>
        {showAnomaly && anomalyData.detected && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="mb-6 relative"
          >
            <div className="bg-gradient-to-r from-red-950/90 to-orange-950/90 backdrop-blur-xl rounded-2xl p-5 border border-red-500/50 shadow-2xl shadow-red-500/20">
              <button
                onClick={() => setShowAnomaly(false)}
                className="absolute top-3 right-3 text-red-300 hover:text-red-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
                  <AlertCircle className="w-6 h-6 text-red-400" />
                </div>
                <div className="flex-1 pt-1">
                  <h3 className="font-bold text-red-300 mb-1">
                    Localized Surge Detected
                  </h3>
                  <p className="text-sm text-red-200/90 leading-relaxed mb-2">
                    Actual {anomalyData.pollutant} levels exceed predicted baseline by{" "}
                    <span className="font-bold">{anomalyData.exceedPercentage}%</span>
                  </p>
                  <div className="flex items-center gap-4 text-xs text-red-300/70">
                    <span>Z-score: {anomalyData.zScore}</span>
                    <span>•</span>
                    <span>{anomalyData.timestamp}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Live Telemetry Cards */}
      <div className="space-y-4 mb-6">
        {telemetryCards.map((card, index) => {
          const TrendIcon = getTrendIcon(card.trend);
          const trendColor = getTrendColor(card.trend);
          const CardIcon = card.icon;

          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-5 border border-zinc-800 shadow-xl"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center`}>
                    <CardIcon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <div>
                    <div className="text-sm text-zinc-400">{card.label}</div>
                    <div className="text-2xl font-bold">
                      {card.value}{" "}
                      <span className="text-sm text-zinc-500 font-normal">
                        {card.unit}
                      </span>
                    </div>
                  </div>
                </div>

                <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-800 ${trendColor}`}>
                  <TrendIcon className="w-4 h-4" />
                  <span className="text-xs capitalize">{card.trend}</span>
                </div>
              </div>

              {/* 24-hour Sparkline */}
              <div className="bg-zinc-800/30 rounded-lg p-3 border border-zinc-700/50">
                <div className="text-xs text-zinc-500 mb-2">24-Hour Trend</div>
                <CustomSparkline data={card.data} color={card.color} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Accumulation Patterns Info */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-5 border border-zinc-800 shadow-xl">
        <h3 className="font-semibold mb-3">Pollutant Accumulation Patterns</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-zinc-800">
            <span className="text-sm text-zinc-400">Peak Hours</span>
            <span className="text-sm font-medium">6AM - 9AM, 5PM - 8PM</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-zinc-800">
            <span className="text-sm text-zinc-400">Average Daily PM 2.5</span>
            <span className="text-sm font-medium">38.2 μg/m³</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-sm text-zinc-400">Data Quality</span>
            <span className="text-sm font-medium text-emerald-400">Excellent (99.8%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}