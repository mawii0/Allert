import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Smile,
  Meh,
  Frown,
  BookOpen,
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Slider } from "./ui/slider";
import { saveHealthLog, getHealthLogs, type HealthLogEntry } from "../utils/auth";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

type Symptom =
  | "sneezing"
  | "itchy-nose"
  | "runny-nose"
  | "congestion";

interface DiaryEntry {
  id: string;
  date: string;
  vasScore: number;
  tnssScore: number;
  riskLevel: number;
  notes?: string;
}

// Convert HealthLogEntry to DiaryEntry for display
const convertHealthLogToDiaryEntry = (log: HealthLogEntry): DiaryEntry => {
  const date = new Date(log.date);
  const dateString = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return {
    id: log.id,
    date: dateString,
    vasScore: log.vasScore,
    tnssScore: log.tnssScore,
    riskLevel: log.riskLevel,
    notes: log.notes,
  };
};

export function ClinicalScreen() {
  const [vasScore, setVasScore] = useState([5]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<Symptom[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  // TNSS: Symptom carousel and severity scores (0-4 for each)
  const [currentSymptomIndex, setCurrentSymptomIndex] =
    useState(0);
  const [symptomSeverities, setSymptomSeverities] = useState<
    Record<Symptom, number>
  >({
    sneezing: 0,
    "itchy-nose": 0,
    "runny-nose": 0,
    congestion: 0,
  });

  const symptoms: { id: Symptom; label: string }[] = [
    { id: "sneezing", label: "Sneezing" },
    { id: "itchy-nose", label: "Itchy Nose" },
    { id: "runny-nose", label: "Runny Nose" },
    { id: "congestion", label: "Congestion" },
  ];

  // Diary entries (loaded from Supabase)
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);

  // Load health logs from Supabase on mount
  useEffect(() => {
    const loadHealthLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const result = await getHealthLogs();
        if (result.success && result.logs) {
          const entries = result.logs.map(convertHealthLogToDiaryEntry);
          setDiaryEntries(entries);
        } else {
          console.error("Failed to load health logs:", result.error);
        }
      } catch (error) {
        console.error("Error loading health logs:", error);
      } finally {
        setIsLoadingLogs(false);
      }
    };

    loadHealthLogs();
  }, []);

  // Historical trend data for the chart
  const historicalTrendData = diaryEntries
    .slice()
    .reverse()
    .map((entry, index) => ({
      id: entry.id,
      date: entry.date.split(",")[0].replace("Mar ", ""),
      risk: entry.riskLevel,
      severity: entry.vasScore,
    }));

  const toggleSymptom = (symptom: Symptom) => {
    setSelectedSymptoms((prev) =>
      prev.includes(symptom)
        ? prev.filter((s) => s !== symptom)
        : [...prev, symptom],
    );
  };

  // Mock correlation data for Spearman's graph
  const correlationData = [
    { day: "Mon", risk: 0.15, symptoms: 2, id: 1 },
    { day: "Tue", risk: 0.22, symptoms: 3, id: 2 },
    { day: "Wed", risk: 0.38, symptoms: 5, id: 3 },
    { day: "Thu", risk: 0.52, symptoms: 6, id: 4 },
    { day: "Fri", risk: 0.48, symptoms: 6, id: 5 },
    { day: "Sat", risk: 0.35, symptoms: 4, id: 6 },
    { day: "Sun", risk: 0.18, symptoms: 2, id: 7 },
  ];

  const getVasEmoji = (score: number) => {
    if (score <= 3)
      return <Smile className="w-8 h-8 text-emerald-400" />;
    if (score <= 6)
      return <Meh className="w-8 h-8 text-yellow-400" />;
    return <Frown className="w-8 h-8 text-red-400" />;
  };

  const getVasColor = (score: number) => {
    if (score <= 3) return "text-emerald-400";
    if (score <= 6) return "text-yellow-400";
    return "text-red-400";
  };

  const getVasDescription = (score: number) => {
    if (score <= 3) return "Minimal symptoms";
    if (score <= 6) return "Moderate discomfort";
    return "Severe symptoms";
  };

  // TNSS: Get color based on severity (0-4)
  const getTnssColor = (severity: number) => {
    if (severity === 0) return "text-zinc-400";
    if (severity === 1) return "text-emerald-400";
    if (severity === 2) return "text-yellow-400";
    if (severity === 3) return "text-orange-400";
    return "text-red-400";
  };

  const getTnssLabel = (severity: number) => {
    const labels = ["None", "Mild", "Moderate", "Severe"];
    return labels[severity] || labels[0];
  };

  const handlePrevSymptom = () => {
    setCurrentSymptomIndex((prev) =>
      prev === 0 ? symptoms.length - 1 : prev - 1,
    );
  };

  const handleNextSymptom = () => {
    setCurrentSymptomIndex((prev) =>
      prev === symptoms.length - 1 ? 0 : prev + 1,
    );
  };

  const updateSymptomSeverity = (
    symptomId: Symptom,
    severity: number,
  ) => {
    setSymptomSeverities((prev) => ({
      ...prev,
      [symptomId]: severity,
    }));
  };

  const totalTnssScore = useMemo(() => {
    return Object.values(symptomSeverities).reduce(
      (sum, val) => sum + val,
      0,
    );
  }, [symptomSeverities]);

  const currentSymptom = symptoms[currentSymptomIndex];
  const currentSeverity = symptomSeverities[currentSymptom.id];

  // Save today's entry
  const handleSaveEntry = async () => {
    setSaveError("");
    setIsSaving(true);

    try {
      // Calculate risk level (based on VAS and TNSS)
      const riskLevel = Math.min(
        Math.round(vasScore[0] * 3 + totalTnssScore * 1.5),
        50
      );

      // Save to Supabase
      const result = await saveHealthLog(
        vasScore[0],
        totalTnssScore,
        riskLevel
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to save health log");
      }

      // Convert the saved entry to DiaryEntry format
      if (result.entry) {
        const newEntry = convertHealthLogToDiaryEntry(result.entry);
        // Add to beginning of array (most recent first)
        setDiaryEntries((prev) => [newEntry, ...prev]);
      }

      // Show success feedback
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);

      // Reset form (optional - comment out if you want to keep values)
      // setVasScore([5]);
      // setSymptomSeverities({ "sneezing": 0, "itchy-nose": 0, "runny-nose": 0, "congestion": 0 });
    } catch (error: any) {
      console.error("Error saving health log:", error);
      setSaveError(error.message || "Failed to save entry. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 relative">
      {/* Header with History Button */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm text-zinc-400 mb-1">
            Clinical Health Suite
          </div>
          <h1 className="text-2xl font-bold">
            Symptom Tracker
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Daily symptom logging & validation
          </p>
        </div>

        {/* History/Diary Button */}
        <button
          onClick={() => setShowHistory(true)}
          className="w-12 h-12 rounded-full bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center transition-all shadow-lg"
        >
          <BookOpen className="w-5 h-5 text-emerald-400" />
        </button>
      </div>

      {/* Daily VAS Slider */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        <h3 className="font-semibold mb-2">
          Visual Analog Scale (VAS)
        </h3>
        <p className="text-xs text-zinc-500 mb-6">
          Rate your overall symptom severity today
        </p>

        <div className="flex items-center justify-center mb-6">
          <motion.div
            key={vasScore[0]}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            {getVasEmoji(vasScore[0])}
          </motion.div>
        </div>

        <div className="mb-6">
          <Slider
            value={vasScore}
            onValueChange={setVasScore}
            min={0}
            max={10}
            step={1}
            className="w-full"
          />
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-zinc-400">
            Severity Score
          </div>
          <div
            className={`text-3xl font-bold ${getVasColor(vasScore[0])}`}
          >
            {vasScore[0]}
            <span className="text-sm text-zinc-500 font-normal">
              /10
            </span>
          </div>
        </div>

        <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
          <div className="text-xs text-zinc-400">
            {getVasDescription(vasScore[0])}
          </div>
        </div>

        {/* Scale Reference */}
        <div className="flex justify-between mt-4 text-xs text-zinc-500">
          <span>0 - No symptoms</span>
          <span>10 - Worst possible</span>
        </div>
      </div>

      {/* Symptom Checklist (TNSS) */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        <h3 className="font-semibold mb-2">
          Total Nasal Symptom Score (TNSS)
        </h3>
        <p className="text-xs text-zinc-500 mb-6">
          Rate the severity of each symptom
        </p>

        {/* Symptom Navigation with Arrows */}
        <div className="bg-zinc-800/50 rounded-xl p-5 border border-zinc-700/50 mb-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={handlePrevSymptom}
              className="w-10 h-10 rounded-full bg-zinc-700/50 hover:bg-zinc-600 border border-zinc-600 flex items-center justify-center transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentSymptomIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="text-center flex-1 mx-4"
              >
                <div className="text-xl font-bold">
                  {currentSymptom.label}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {currentSymptomIndex + 1} of {symptoms.length}
                </div>
              </motion.div>
            </AnimatePresence>

            <button
              onClick={handleNextSymptom}
              className="w-10 h-10 rounded-full bg-zinc-700/50 hover:bg-zinc-600 border border-zinc-600 flex items-center justify-center transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Severity Slider (0-4) */}
          <div className="mb-6">
            <Slider
              value={[currentSeverity]}
              onValueChange={(value) =>
                updateSymptomSeverity(
                  currentSymptom.id,
                  value[0],
                )
              }
              min={0}
              max={3}
              step={1}
              className="w-full"
            />
          </div>

          {/* Current Severity Display */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-zinc-400">
              Severity Level
            </div>
            <div
              className={`text-3xl font-bold ${getTnssColor(currentSeverity)}`}
            >
              {currentSeverity}
              <span className="text-sm text-zinc-500 font-normal">
                /3
              </span>
            </div>
          </div>

          <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-700/50">
            <div
              className={`text-sm ${getTnssColor(currentSeverity)}`}
            >
              {getTnssLabel(currentSeverity)}
            </div>
          </div>

          {/* Severity Scale Reference */}
          <div className="flex justify-between mt-4 text-xs text-zinc-500">
            <span>0 - None</span>
            <span>3 - Severe</span>
          </div>
        </div>

        {/* Total TNSS Score Display */}
        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-zinc-400 mb-1">
                Total TNSS Score
              </div>
              <div className="text-xs text-zinc-500">
                Sum of all 4 symptoms
              </div>
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              {totalTnssScore}
              <span className="text-sm text-zinc-500 font-normal">
                /12
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Spearman's Correlation Graph */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800 shadow-xl">
        <h3 className="font-semibold mb-2">
          Clinical Validation
        </h3>
        <p className="text-xs text-zinc-500 mb-4">
          Correlation between predicted risk and reported
          symptoms
        </p>

        <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-700/50">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={correlationData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis
                yAxisId="left"
                domain={[0, 1]}
                stroke="#3b82f6"
                label={{
                  value: "Risk Probability",
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 10]}
                stroke="#eab308"
                label={{
                  value: "Symptom Score",
                  angle: 90,
                  position: "insideRight",
                }}
              />
              <Tooltip />
              <Legend />
              <Line
                key="correlation-risk-line"
                type="monotone"
                dataKey="risk"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Predicted Risk"
                yAxisId="left"
                dotRadius={4}
              />
              <Line
                key="correlation-symptoms-line"
                type="monotone"
                dataKey="symptoms"
                stroke="#eab308"
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Symptom Score"
                yAxisId="right"
                dotRadius={4}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
          <div className="flex justify-between items-center">
            <span className="text-xs text-zinc-400">
              Spearman's ρ
            </span>
            <span className="text-sm font-bold text-emerald-400">
              0.87
            </span>
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            Strong positive correlation (p &lt; 0.001)
          </div>
        </div>
      </div>

      {/* Historical Trend Chart */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800 shadow-xl">
        <h3 className="font-semibold mb-2">Historical Trend</h3>
        <p className="text-xs text-zinc-500 mb-4">
          Risk level and symptom severity over the past 7 days
        </p>

        <div className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-700/50">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={historicalTrendData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis
                yAxisId="left"
                domain={[0, 50]}
                stroke="#3b82f6"
                label={{
                  value: "Risk Level",
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 10]}
                stroke="#eab308"
                label={{
                  value: "Severity Score",
                  angle: 90,
                  position: "insideRight",
                }}
              />
              <Tooltip />
              <Legend />
              <Line
                key="historical-risk-line"
                type="monotone"
                dataKey="risk"
                stroke="#3b82f6"
                strokeWidth={2}
                name="Risk Level"
                yAxisId="left"
                dotRadius={4}
              />
              <Line
                key="historical-severity-line"
                type="monotone"
                dataKey="severity"
                stroke="#eab308"
                strokeWidth={2}
                strokeDasharray="5 5"
                name="Severity Score"
                yAxisId="right"
                dotRadius={4}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Error Message */}
      {saveError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2"
        >
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{saveError}</p>
        </motion.div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSaveEntry}
        disabled={isSaving}
        className="w-full mt-6 h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving ? "Saving..." : "Save Today's Entry"}
      </button>

      {/* Success Toast */}
      <AnimatePresence>
        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 z-50"
          >
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">
              Entry saved successfully!
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History & Diary Slide-Up Overlay */}
      <AnimatePresence>
        {showHistory && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />

            {/* Slide-Up Panel */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 300,
              }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(e, info) => {
                if (info.offset.y > 150) {
                  setShowHistory(false);
                }
              }}
              className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
            >
              {/* Drag Handle */}
              <div className="w-full pt-4 pb-2 flex justify-center">
                <div className="w-12 h-1.5 bg-zinc-700 rounded-full" />
              </div>

              {/* Header */}
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    Health Log
                  </h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Your symptom history & trends
                  </p>
                </div>
                <button
                  onClick={() => setShowHistory(false)}
                  className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                {/* Historical Trend Chart */}
                <div className="bg-zinc-800/50 backdrop-blur-sm rounded-2xl p-5 mb-6 border border-zinc-700 shadow-xl">
                  <h3 className="font-semibold mb-3">
                    7-Day Trend
                  </h3>
                  <div className="bg-zinc-900/50 rounded-lg p-4 border border-zinc-700/50">
                    <ResponsiveContainer
                      width="100%"
                      height={200}
                    >
                      <BarChart
                        data={historicalTrendData}
                        margin={{
                          top: 5,
                          right: 10,
                          left: -20,
                          bottom: 5,
                        }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#3f3f46"
                        />
                        <XAxis
                          dataKey="date"
                          stroke="#71717a"
                          style={{ fontSize: "11px" }}
                        />
                        <YAxis
                          stroke="#71717a"
                          style={{ fontSize: "11px" }}
                          domain={[0, 50]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#18181b",
                            border: "1px solid #3f3f46",
                            borderRadius: "8px",
                            fontSize: "12px",
                          }}
                        />
                        <Bar
                          dataKey="risk"
                          fill="#3b82f6"
                          radius={[6, 6, 0, 0]}
                          name="Risk Level %"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Diary Entries List */}
                <div>
                  <h3 className="font-semibold mb-3 text-sm text-zinc-400 uppercase tracking-wider">
                    Daily Entries
                  </h3>
                  <div className="space-y-3">
                    {diaryEntries.map((entry, index) => (
                      <motion.div
                        key={entry.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700 hover:border-zinc-600 transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-semibold text-sm">
                              {entry.date}
                            </div>
                            <div className="text-xs text-zinc-500 mt-0.5">
                              TNSS: {entry.tnssScore}/16
                            </div>
                          </div>
                          <div
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              entry.riskLevel < 15
                                ? "bg-emerald-500/20 text-emerald-300"
                                : entry.riskLevel < 25
                                  ? "bg-yellow-500/20 text-yellow-300"
                                  : entry.riskLevel < 40
                                    ? "bg-orange-500/20 text-orange-300"
                                    : "bg-red-500/20 text-red-300"
                            }`}
                          >
                            {entry.riskLevel}% Risk
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-zinc-900/50 rounded-lg p-2 border border-zinc-700/50">
                            <div className="text-xs text-zinc-500">
                              VAS Score
                            </div>
                            <div
                              className={`text-lg font-bold ${getVasColor(
                                entry.vasScore,
                              )}`}
                            >
                              {entry.vasScore}
                              <span className="text-xs text-zinc-500 font-normal">
                                /10
                              </span>
                            </div>
                          </div>
                          <div className="bg-zinc-900/50 rounded-lg p-2 border border-zinc-700/50">
                            <div className="text-xs text-zinc-500">
                              TNSS Score
                            </div>
                            <div className="text-lg font-bold">
                              {entry.tnssScore}
                              <span className="text-xs text-zinc-500 font-normal">
                                /16
                              </span>
                            </div>
                          </div>
                        </div>

                        {entry.notes && (
                          <div className="bg-zinc-900/30 rounded-lg p-2 border border-zinc-700/30">
                            <div className="text-xs text-zinc-400 italic">
                              "{entry.notes}"
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Bottom spacing for safe scrolling */}
                <div className="h-6" />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}