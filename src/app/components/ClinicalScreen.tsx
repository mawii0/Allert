import { useState, useMemo, useEffect, useRef } from "react";
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
  Download,
  Pencil,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { Slider } from "./ui/slider";
import { useDiary } from "../utils/useDiary";
import type { DiaryEntry, DiaryFields } from "../utils/diary";
import { diaryCsv, diaryDailyTrend, filteredDiary, manilaInput } from "../utils/diary-history.mjs";
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

const symptoms = [
  { id: "sneezing", label: "Sneezing" }, { id: "itchy-nose", label: "Itchy Nose" },
  { id: "runny-nose", label: "Runny Nose" }, { id: "congestion", label: "Congestion" },
] as const;
const emptySymptoms = () => Object.fromEntries(symptoms.map(({ id }) => [id, 0]));
const displayTime = (value: string) => new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const inputClass = "w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

export function ClinicalScreen() {
  const diary = useDiary();
  const [showHistory, setShowHistory] = useState(false);
  const [currentSymptomIndex, setCurrentSymptomIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [vas, setVas] = useState(5);
  const [scores, setScores] = useState<Record<string, number> | null>(emptySymptoms);
  const [aggregate, setAggregate] = useState(0);
  const [notes, setNotes] = useState("");
  const [observed, setObserved] = useState(() => manilaInput(Date.now()));
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(30);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<DiaryEntry | null>(null);
  const deletingRef = useRef<DiaryEntry | null>(null);
  deletingRef.current = deleting;
  const [now, setNow] = useState(Date.now());
  const pending = useRef<{ id: string; payload: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const closeHistory = useRef<HTMLButtonElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const tnss = scores ? Object.values(scores).reduce((sum, value) => sum + value, 0) : aggregate;
  const filtered = useMemo(() => filteredDiary(diary.entries, query, days, now), [diary.entries, query, days, now]);
  const trend = useMemo(() => diaryDailyTrend(filteredDiary(diary.entries, "", 7, now)), [diary.entries, now]);

  function newEntry() {
    setEditing(null); setVas(5); setScores(emptySymptoms()); setAggregate(0); setNotes("");
    setObserved(manilaInput(Date.now())); setFormError(""); pending.current = null;
    setCurrentSymptomIndex(0); setDetailsOpen(false);
  }
  useEffect(() => {
    const reset = () => { newEntry(); setQuery(""); setDays(30); setDeleting(null); setNotice(""); setShowHistory(false); };
    const tick = window.setInterval(() => setNow(Date.now()), 60000);
    window.addEventListener("storage", reset); window.addEventListener("allert-session-changed", reset);
    return () => { window.clearInterval(tick); window.removeEventListener("storage", reset); window.removeEventListener("allert-session-changed", reset); };
  }, []);
  useEffect(() => {
    if (!deleting) return;
    cancelDelete.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !diary.busy) setDeleting(null); };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [deleting, diary.busy]);

  function edit(entry: DiaryEntry) {
    setEditing(entry); setVas(entry.vasScore); setScores(entry.symptomSeverities ? { ...entry.symptomSeverities } : null);
    setAggregate(entry.tnssScore); setNotes(entry.notes || ""); setObserved(entry.observedAt ? manilaInput(entry.observedAt) : "");
    setShowHistory(false); setDetailsOpen(true); setCurrentSymptomIndex(0); setNotice(""); setFormError(""); pending.current = null;
    window.setTimeout(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }, 0);
  }
  async function handleSaveEntry() {
    if (diary.busy || diary.loading) return;
    setNotice(""); setFormError("");
    if (!Number.isInteger(vas) || vas < 0 || vas > 10 || !Number.isInteger(tnss) || tnss < 0 || tnss > 12) {
      setFormError("Choose valid VAS and TNSS scores."); return;
    }
    const time = observed ? new Date(`${observed}:00+08:00`) : null;
    if ((!time && (!editing || editing.observedAt)) || (time && (!Number.isFinite(time.getTime()) || time.getTime() > Date.now() + 60000))) {
      setDetailsOpen(true); setFormError("Choose a valid observation time that is not in the future."); return;
    }
    const observedAt = editing?.observedAt && observed === manilaInput(editing.observedAt) ? editing.observedAt : time?.toISOString();
    const fields: DiaryFields = { vasScore: vas, tnssScore: tnss, notes: notes.trim(), ...(observedAt && { observedAt }), ...(scores && { symptomSeverities: scores }) };
    const payload = JSON.stringify(fields);
    if (!pending.current || pending.current.payload !== payload) pending.current = { id: crypto.randomUUID(), payload };
    const saved = editing ? await diary.update(editing, fields) : await diary.create(fields, pending.current.id);
    if (saved) { setNotice(editing ? "Entry updated." : "Entry saved."); newEntry(); setShowHistory(true); setNow(Date.now()); }
  }
  function exportHistory() {
    const url = URL.createObjectURL(new Blob([diaryCsv(filtered)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `ALLERT_symptoms_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Keep the original slider/carousel layout connected to the diary state.
  const vasScore = [vas];
  const setVasScore = (values: number[]) => setVas(values[0]);
  const totalTnssScore = tnss;
  const currentSymptom = symptoms[currentSymptomIndex];
  const currentSeverity = scores?.[currentSymptom.id] ?? 0;
  const isSaving = diary.busy;
  const isLoadingLogs = diary.loading;
  const loadError = diary.error;
  const saveError = formError;
  const diaryEntries = filtered;
  const historicalTrendData = trend.map(point => ({ date: point.day.slice(5), tnss: point.tnss, severity: point.vas }));
  const handlePrevSymptom = () => setCurrentSymptomIndex(value => value === 0 ? symptoms.length - 1 : value - 1);
  const handleNextSymptom = () => setCurrentSymptomIndex(value => value === symptoms.length - 1 ? 0 : value + 1);
  const updateSymptomSeverity = (id: string, value: number) => setScores(previous => previous ? { ...previous, [id]: value } : previous);

  useEffect(() => {
    if (!showHistory) return;
    closeHistory.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !deletingRef.current) setShowHistory(false); };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); historyButton.current?.focus(); };
  }, [showHistory]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

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

  // TNSS: Get color based on severity (0-3)
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

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-8 relative">
      {/* Header with History Button */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm text-zinc-400 mb-1">
            Clinical Health Suite
          </div>
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">
            Symptom Tracker
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Daily symptom logging & validation
          </p>
        </div>

        {/* History/Diary Button */}
        <button
          ref={historyButton}
          aria-label="Open symptom history"
          onClick={() => setShowHistory(true)}
          className="w-12 h-12 rounded-full bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center transition-all shadow-lg"
        >
          <BookOpen className="w-5 h-5 text-emerald-400" />
        </button>
      </div>

      {editing && <div className="bg-zinc-900/50 rounded-xl p-4 mb-6 border border-emerald-500/30">
        <p className="font-semibold text-sm">Editing saved entry</p>
        <p className="text-xs text-zinc-400 mt-1">Its original creation time is retained.</p>
        <button type="button" disabled={diary.busy} onClick={() => { newEntry(); setShowHistory(true); }} className="text-xs text-emerald-400 underline mt-3">Cancel editing</button>
      </div>}

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
            aria-label="Overall symptom severity"
            value={vasScore}
            disabled={diary.busy}
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
      {scores ? <>
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
              aria-label="Previous symptom"
              type="button"
              disabled={diary.busy}
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
              aria-label="Next symptom"
              type="button"
              disabled={diary.busy}
              onClick={handleNextSymptom}
              className="w-10 h-10 rounded-full bg-zinc-700/50 hover:bg-zinc-600 border border-zinc-600 flex items-center justify-center transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Severity Slider (0-3) */}
          <div className="mb-6">
            <Slider
              aria-label={`${currentSymptom.label} severity`}
              value={[currentSeverity]}
              disabled={diary.busy}
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

      </> : <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        <h3 className="font-semibold mb-2">Total Nasal Symptom Score (TNSS)</h3>
        <p className="text-xs text-zinc-500 mb-4">Only the total was recorded for this older entry. Individual symptom ratings remain unknown.</p>
        <label htmlFor="diary-total" className="block text-sm text-zinc-400 mb-2">Recorded TNSS total</label>
        <input id="diary-total" type="number" min={0} max={12} step={1} disabled={diary.busy} value={aggregate} onChange={event => setAggregate(Number(event.target.value))} className={inputClass} />
      </div>}

      <details open={detailsOpen} onToggle={event => setDetailsOpen(event.currentTarget.open)} className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-zinc-800 shadow-xl">
        <summary className="font-semibold cursor-pointer">Entry details &amp; notes</summary>
        <div className="mt-5 space-y-4">
          <div><label htmlFor="diary-time" className="block text-sm text-zinc-400 mb-2">Observation time</label>
            <input id="diary-time" type="datetime-local" disabled={diary.busy} required={!editing || Boolean(editing.observedAt)} value={observed} max={manilaInput(now)} onChange={event => setObserved(event.target.value)} className={inputClass} />
            <p className="text-xs text-zinc-500 mt-2">Iloilo time (UTC+8). Choose when you observed the symptoms.</p>
            {editing && !editing.observedAt && <p className="text-xs text-amber-300 mt-2">Observation time was not recorded for this older entry. Leave it blank unless you know the actual time.</p>}
          </div>
          <div><label htmlFor="diary-notes" className="block text-sm text-zinc-400 mb-2">Notes (optional)</label>
            <textarea id="diary-notes" disabled={diary.busy} rows={3} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Activities, exposures, or anything you want to remember" className={inputClass} />
            <p className="text-xs text-zinc-500 mt-1">{notes.length}/2000 characters</p>
          </div>
        </div>
      </details>

      <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800">
        <h3 className="font-semibold mb-2">Clinical Validation</h3>
        <p className="text-xs text-zinc-400">Correlation analysis is awaiting matched environmental and symptom history. No clinical correlation has been calculated for your account.</p>
      </div>
      {loadError && <div role="alert" className="text-sm text-amber-300 mt-4"><p>{loadError}</p><button disabled={diary.busy} onClick={diary.retry} className="underline mt-2">Refresh history</button></div>}
      {!isLoadingLogs && !loadError && diaryEntries.length === 0 && <p className="text-sm text-zinc-400 mt-4">No saved entries yet.</p>}

      {/* Historical Trend Chart */}
      <div className="bg-zinc-900/50 backdrop-blur-sm rounded-2xl p-6 border border-zinc-800 shadow-xl">
        <h3 className="font-semibold mb-2">Historical Trend</h3>
        <p className="text-xs text-zinc-500 mb-4">
          Last 7 days: daily VAS and TNSS averages
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
                domain={[0, 12]}
                stroke="#3b82f6"
                label={{
                  value: "TNSS Score",
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
                dataKey="tnss"
                stroke="#3b82f6"
                strokeWidth={2}
                name="TNSS /12"
                yAxisId="left"
                dot={{ r: 4 }}
              />
              <Line
                key="historical-severity-line"
                type="monotone"
                dataKey="severity"
                stroke="#eab308"
                strokeWidth={2}
                strokeDasharray="5 5"
                name="VAS /10"
                yAxisId="right"
                dot={{ r: 4 }}
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
          <p role="alert" className="text-sm text-red-300">{saveError}</p>
        </motion.div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSaveEntry}
        disabled={isSaving || diary.loading}
        className="w-full mt-6 h-12 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-500/20 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSaving ? "Saving..." : editing ? "Save changes" : "Save Today's Entry"}
      </button>

      {/* Success Toast */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-emerald-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-2 z-[70]"
          >
            <CheckCircle className="w-5 h-5" />
            <span role="status" className="font-semibold">
              {notice}
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
              role="dialog"
              aria-modal="true"
              aria-label="Symptom history"
              aria-hidden={Boolean(deleting)}
              onKeyDown={event => {
                if (event.key !== "Tab") return;
                const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
                const first = controls[0], last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
                else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
              }}
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
              className="fixed bottom-0 left-1/2 z-50 w-full max-w-md -translate-x-1/2 bg-zinc-900 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
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
                  ref={closeHistory}
                  autoFocus
                  aria-label="Close symptom history"
                  onClick={() => setShowHistory(false)}
                  className="w-10 h-10 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="bg-zinc-800/50 backdrop-blur-sm rounded-2xl p-5 mb-6 border border-zinc-700 shadow-xl">
                  <div className="flex items-center justify-between mb-4"><h3 className="font-semibold">Saved entries</h3><button type="button" disabled={diary.busy || diary.loading} aria-label="Refresh symptom history" onClick={diary.retry} className="w-9 h-9 rounded-full bg-zinc-700/50 flex items-center justify-center disabled:opacity-50"><RefreshCw className="w-4 h-4" /></button></div>
                  <label htmlFor="diary-search" className="block text-xs text-zinc-400 mb-2">Search notes, date, or scores</label>
                  <input id="diary-search" type="search" value={query} onChange={event => setQuery(event.target.value)} className={inputClass} />
                  <label htmlFor="diary-window" className="block text-xs text-zinc-400 mt-4 mb-2">Time range</label>
                  <select id="diary-window" value={days} onChange={event => setDays(Number(event.target.value))} className={inputClass}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={0}>All loaded entries</option></select>
                  <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-zinc-400">{filtered.length} matching {filtered.length === 1 ? "entry" : "entries"}</p><button disabled={!filtered.length || diary.loading} onClick={exportHistory} className="rounded-lg bg-zinc-700/50 p-2 text-xs text-emerald-400 disabled:opacity-50"><Download className="inline w-4 h-4 mr-1" />Export CSV</button></div>
                  {diary.truncated && <p className="mt-3 text-xs text-amber-300">Up to 500 records are loaded. Export contains the filtered loaded entries.</p>}
                  {diary.error && <div role="alert" className="text-xs text-amber-300 mt-3"><p>{diary.error}</p><button disabled={diary.busy} onClick={diary.retry} className="underline mt-2">Refresh history</button></div>}
                </div>

                {/* Historical Trend Chart */}
                <div className="bg-zinc-800/50 backdrop-blur-sm rounded-2xl p-5 mb-6 border border-zinc-700 shadow-xl">
                  <h3 className="font-semibold mb-3">
                    Seven-Day Symptom Trend
                  </h3>
                  <p className="text-xs text-zinc-500 mb-3">Daily VAS/TNSS averages. Older entries use creation time when observation time is unknown. Days without reports are omitted.</p>
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
                          domain={[0, 12]}
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
                          dataKey="tnss"
                          fill="#3b82f6"
                          radius={[6, 6, 0, 0]}
                          name="TNSS /12"
                        />
                        <Bar dataKey="severity" fill="#eab308" radius={[6, 6, 0, 0]} name="VAS /10" />
                        <Legend />
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
                    {diary.loading && <p role="status" className="text-sm text-zinc-400">Loading your history…</p>}
                    {!diary.loading && !diary.error && diaryEntries.length === 0 && <p className="text-sm text-zinc-400">{diary.entries.length ? "No entries match these filters." : "No saved entries yet."}</p>}
                    {!diary.loading && diaryEntries.map((entry, index) => (
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
                              {displayTime(entry.observedAt || entry.date)}
                            </div>
                            <div className="text-xs text-zinc-500 mt-0.5">
                              {entry.observedAt ? "Observed" : "Recorded"} · TNSS: {entry.tnssScore}/12
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
                            {entry.riskLevel}/50 Summary
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
                                /12
                              </span>
                            </div>
                          </div>
                        </div>

                        {entry.notes && (
                          <div className="bg-zinc-900/30 rounded-lg p-2 border border-zinc-700/30">
                            <div className="text-xs text-zinc-400 italic whitespace-pre-wrap break-words">
                              "{entry.notes}"
                            </div>
                          </div>
                        )}
                        {entry.symptomSeverities && <dl className="grid grid-cols-2 gap-2 mt-3 text-xs text-zinc-400">{symptoms.map(({id, label}) => <div key={id}><dt>{label}</dt><dd>{entry.symptomSeverities![id]}/3</dd></div>)}</dl>}
                        {entry.updatedAt && <p className="text-xs text-zinc-500 mt-3">Edited {displayTime(entry.updatedAt)}</p>}
                        <div className="flex gap-3 mt-3">
                          <button type="button" disabled={diary.busy} onClick={() => edit(entry)} className="rounded-lg bg-zinc-700/50 px-3 py-2 text-xs text-emerald-400 disabled:opacity-50"><Pencil className="inline w-3.5 h-3.5 mr-1" />Edit</button>
                          <button type="button" disabled={diary.busy} onClick={() => { setDeleting(entry); setNotice(""); }} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-300 disabled:opacity-50"><Trash2 className="inline w-3.5 h-3.5 mr-1" />Delete</button>
                        </div>
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
    {deleting && <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-6"><section role="dialog" aria-modal="true" aria-labelledby="delete-diary-title" onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = controls[0], last = controls[controls.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6"><h2 id="delete-diary-title" className="font-semibold text-lg">Delete this entry?</h2><p className="mt-3 text-sm text-zinc-300">The entry from {displayTime(deleting.observedAt || deleting.date)} will be removed from your diary. Its scores and notes will be deleted; this cannot be undone.</p>{diary.error && <p role="alert" className="mt-3 text-sm text-red-300">{diary.error}</p>}<div className="flex gap-3 mt-5"><button ref={cancelDelete} disabled={diary.busy} onClick={() => setDeleting(null)} className="flex-1 rounded-lg bg-zinc-800 p-3">Cancel</button><button disabled={diary.busy} onClick={async () => { if (await diary.remove(deleting)) { setDeleting(null); setNotice("Entry deleted."); if (editing?.id === deleting.id) newEntry(); } }} className="flex-1 rounded-lg bg-red-700 p-3">{diary.busy ? "Deleting…" : "Delete entry"}</button></div></section></div>}
    </div>
  );
}
