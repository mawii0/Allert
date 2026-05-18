import {
  AlertTriangle,
  CalendarClock,
  Clipboard,
  FileText,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import { AdminSearchBar } from "./AdminSearchBar";

const metadata = [
  { label: "Anomaly ID", value: "anom-2026-0514-1432-7a3f" },
  { label: "Timestamp", value: "2026-05-14 14:32:00 PST" },
  { label: "Triggering Node", value: "ilo-node-03" },
  { label: "Detection Method", value: "Z-Score + Velocity Override" },
  { label: "Z-Score", value: "Z = 4.2", badge: "#ef4444" },
  { label: "Velocity", value: "18.5 ug/m3/h", badge: "#ef4444" },
  { label: "CUSUM Score", value: "S_i = 12.7", badge: "#f59e0b" },
  { label: "Risk Output", value: "P_risk = 85.3% - VERY HIGH", badge: "#ff1744" },
];

const comparisonRows = [
  {
    metric: "PM2.5",
    forecast: "38.1 ug/m3",
    observed: "62.3 ug/m3",
    deviation: "+24.2 ug/m3 (+63.5%)",
    color: "#ff1744",
  },
  {
    metric: "PM10",
    forecast: "52.4 ug/m3",
    observed: "78.9 ug/m3",
    deviation: "+26.5 ug/m3 (+50.6%)",
    color: "#ff1744",
  },
  {
    metric: "Temperature",
    forecast: "27.8 C",
    observed: "28.0 C",
    deviation: "+0.2 C",
    color: "#00c853",
  },
  {
    metric: "Humidity",
    forecast: "71.5%",
    observed: "72.0%",
    deviation: "+0.5%",
    color: "#00c853",
  },
];

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold"
      style={{ borderColor: color, color }}
    >
      {label}
    </span>
  );
}

export function AdminAnomalyInvestigationScreen() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-[1200px] space-y-6 px-6 py-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-[#2a2a2a] bg-[#141414] px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs text-[#b0b0b0]">Anomaly Investigation</div>
            <div className="text-lg font-semibold">SPIKE_EMERGENCY Event</div>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <AdminSearchBar className="w-full md:w-72" />
            <div className="flex items-center gap-3 text-xs text-[#b0b0b0]">
              <CalendarClock className="h-4 w-4" />
              2026-05-14 14:32 PST
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
          <div className="mb-4 text-sm font-semibold">Event Metadata</div>
          <div className="grid gap-3 md:grid-cols-2">
            {metadata.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-sm"
              >
                <span className="text-[#b0b0b0]">{item.label}</span>
                <span className="flex items-center gap-2">
                  {item.badge ? <Badge label={item.value} color={item.badge} /> : item.value}
                  {item.label === "Anomaly ID" && (
                    <Clipboard className="h-4 w-4 text-[#b0b0b0]" />
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">Forecast vs Actual</div>
            <div className="grid gap-2 text-sm text-[#b0b0b0]">
              <div className="grid grid-cols-[120px_1fr_1fr_1fr] gap-2 text-[11px] uppercase">
                <span>Metric</span>
                <span>Forecast</span>
                <span>Observed</span>
                <span>Deviation</span>
              </div>
              {comparisonRows.map((row) => (
                <div
                  key={row.metric}
                  className="grid grid-cols-[120px_1fr_1fr_1fr] items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2"
                >
                  <span className="text-white">{row.metric}</span>
                  <span>{row.forecast}</span>
                  <span>{row.observed}</span>
                  <span style={{ color: row.color }}>{row.deviation}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">Temporal Context</div>
            <div className="h-[260px] rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
              <svg viewBox="0 0 520 220" className="h-full w-full">
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  points="0,180 80,170 160,165 240,120 320,90 400,110 480,130 520,140"
                />
                <polyline
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  points="0,175 80,165 160,150 240,140 320,130 400,120 480,110 520,100"
                />
                <polyline
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth="1"
                  points="0,190 80,180 160,170 240,160 320,150 400,140 480,130 520,120"
                  opacity="0.3"
                />
                <line x1="320" y1="0" x2="320" y2="220" stroke="#ff1744" />
              </svg>
              <div className="mt-2 text-xs text-[#b0b0b0]">
                SPIKE_EMERGENCY triggered at 14:32
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">Cross-Sensor Correlation</div>
            <div className="h-[240px] rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
              <svg viewBox="0 0 520 220" className="h-full w-full">
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  points="0,180 80,170 160,150 240,110 320,90 400,105 480,120 520,130"
                />
                <polyline
                  fill="none"
                  stroke="#00c853"
                  strokeWidth="2"
                  points="0,190 80,182 160,175 240,168 320,162 400,158 480,160 520,168"
                />
                <polyline
                  fill="none"
                  stroke="#9c27b0"
                  strokeWidth="2"
                  points="0,195 80,190 160,185 240,178 320,170 400,168 480,170 520,175"
                />
              </svg>
            </div>
          </div>
          <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">DENR-EMB Reference Overlay</div>
            <div className="h-[240px] rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
              <svg viewBox="0 0 520 220" className="h-full w-full">
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  points="0,170 80,160 160,140 240,120 320,90 400,110 480,130 520,140"
                />
                <polyline
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="2"
                  strokeDasharray="6 6"
                  points="0,180 80,170 160,155 240,140 320,120 400,130 480,145 520,155"
                />
                <rect x="300" y="90" width="40" height="40" fill="#ff1744" opacity="0.1" />
              </svg>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-[#ff1744]" />
            Manual Classification
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-xs text-[#b0b0b0]">Classification</div>
              <div className="rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-3">
                <div className="flex items-center justify-between text-sm">
                  EXTERNAL_EVENT
                  <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {[
                    "CONFIRMED_ANOMALY",
                    "FALSE_POSITIVE",
                    "SENSOR_ARTIFACT",
                    "EXTERNAL_EVENT",
                  ].map((option) => (
                    <div
                      key={option}
                      className={`rounded-lg px-3 py-2 ${
                        option === "EXTERNAL_EVENT"
                          ? "bg-[#1e1e1e] text-white"
                          : "text-[#b0b0b0]"
                      }`}
                    >
                      {option}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#b0b0b0]">External Event Subtype</div>
                <div className="mt-2 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-sm">
                  Construction
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-[#b0b0b0]">Notes</div>
                <textarea
                  className="mt-2 h-[140px] w-full rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-3 text-sm text-white"
                  placeholder="Add investigation notes (max 500 chars)"
                />
              </div>
              <div>
                <div className="text-xs text-[#b0b0b0]">Attachments</div>
                <div className="mt-2 flex items-center justify-between rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-4 py-3 text-sm">
                  <div className="flex items-center gap-2 text-[#b0b0b0]">
                    <FileText className="h-4 w-4" />
                    Upload evidence
                  </div>
                  <button className="rounded-lg border border-[#2a2a2a] px-3 py-1 text-xs">
                    Browse
                  </button>
                </div>
              </div>
              <button className="w-full rounded-xl bg-[#00bfa5] px-4 py-2 text-sm font-semibold text-[#0a0a0a]">
                Save Classification
              </button>
            </div>
          </div>
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#2a2a2a] bg-[#141414] px-6 py-4 text-xs text-[#b0b0b0]">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Iloilo City Proper
          </div>
          <div className="flex items-center gap-2">
            <Clipboard className="h-4 w-4" />
            Reference anomaly logs updated every 5 min
          </div>
        </section>
      </div>
    </div>
  );
}
