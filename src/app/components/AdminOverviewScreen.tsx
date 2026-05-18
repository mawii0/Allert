import {
  Activity,
  AlertTriangle,
  Bell,
  CloudLightning,
  Cpu,
  Database,
  MapPin,
  Radio,
  ShieldCheck,
  Signal,
} from "lucide-react";
import { AdminSearchBar } from "./AdminSearchBar";

const kpis = [
  {
    label: "Active Sensors",
    value: "6 / 6",
    subtext: "100% online",
    accent: "#00c853",
    icon: Radio,
  },
  {
    label: "Data Availability (24h)",
    value: "97.3%",
    subtext: "Target: >=95%",
    accent: "#00c853",
    icon: Database,
  },
  {
    label: "Alerts Dispatched (24h)",
    value: "12",
    subtext: "3 Very High, 9 Moderate",
    accent: "#ffd600",
    icon: Bell,
  },
  {
    label: "Anomaly Events (24h)",
    value: "2",
    subtext: "1 Resolved, 1 Investigating",
    accent: "#ff9100",
    icon: AlertTriangle,
  },
];

const sensors = [
  {
    id: "ilo-node-01",
    location: "Iloilo City Proper",
    lastSeen: "2 min ago",
    quality: "VALID",
    status: "online",
    telemetry: ["45 ug/m3", "28 C", "72%", "58 ug/m3"],
  },
  {
    id: "ilo-node-02",
    location: "Jaro District",
    lastSeen: "4 min ago",
    quality: "VALID",
    status: "online",
    telemetry: ["39 ug/m3", "27 C", "68%", "52 ug/m3"],
  },
  {
    id: "ilo-node-03",
    location: "Mandurriao",
    lastSeen: "1 min ago",
    quality: "INTERPOLATED",
    status: "online",
    telemetry: ["57 ug/m3", "29 C", "75%", "64 ug/m3"],
  },
  {
    id: "ilo-node-04",
    location: "Arevalo",
    lastSeen: "6 min ago",
    quality: "VALID",
    status: "online",
    telemetry: ["33 ug/m3", "26 C", "69%", "47 ug/m3"],
  },
  {
    id: "ilo-node-05",
    location: "La Paz",
    lastSeen: "12 min ago",
    quality: "VALID",
    status: "online",
    telemetry: ["41 ug/m3", "27 C", "71%", "55 ug/m3"],
  },
  {
    id: "ilo-node-06",
    location: "Molo",
    lastSeen: "18 min ago",
    quality: "OFFLINE",
    status: "offline",
    telemetry: ["--", "--", "--", "--"],
  },
];

const anomalies = [
  {
    time: "14:32",
    node: "ilo-node-03",
    type: "SPIKE_EMERGENCY",
    z: "Z=4.2",
    velocity: "18.5 ug/m3/h",
    status: "Investigating",
  },
  {
    time: "13:11",
    node: "ilo-node-02",
    type: "SPIKE_WARNING",
    z: "Z=3.4",
    velocity: "12.1 ug/m3/h",
    status: "Resolved",
  },
  {
    time: "11:48",
    node: "ilo-node-05",
    type: "SPIKE_WATCH",
    z: "Z=2.6",
    velocity: "7.8 ug/m3/h",
    status: "Resolved",
  },
  {
    time: "09:25",
    node: "ilo-node-01",
    type: "SPIKE_WATCH",
    z: "Z=2.2",
    velocity: "6.4 ug/m3/h",
    status: "False Positive",
  },
  {
    time: "07:03",
    node: "ilo-node-04",
    type: "SPIKE_WARNING",
    z: "Z=3.1",
    velocity: "10.2 ug/m3/h",
    status: "Resolved",
  },
];

const badgeStyles: Record<string, string> = {
  VALID: "bg-[#00c853]/10 text-[#00c853] border-[#00c853]/40",
  INTERPOLATED: "bg-[#ffd600]/10 text-[#ffd600] border-[#ffd600]/40",
  OFFLINE: "bg-[#ff1744]/10 text-[#ff1744] border-[#ff1744]/40",
  SPIKE_WATCH: "bg-[#3b82f6]/10 text-[#3b82f6] border-[#3b82f6]/40",
  SPIKE_WARNING: "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/40",
  SPIKE_EMERGENCY: "bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/40",
};

const sparklineSets = [
  "10 42 22 36 34 38 46 26 58 40 70 22",
  "10 36 22 28 34 34 46 30 58 38 70 40",
  "10 30 22 26 34 36 46 20 58 28 70 34",
  "10 40 22 44 34 32 46 40 58 30 70 46",
  "10 34 22 32 34 38 46 28 58 36 70 30",
  "10 40 22 40 34 40 46 40 58 40 70 40",
];

function Badge({ label }: { label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
        badgeStyles[label] ?? "bg-white/5 text-white/70 border-white/10"
      }`}
    >
      {label}
    </span>
  );
}

function Sparkline({ points }: { points: string }) {
  return (
    <svg viewBox="0 0 80 48" className="h-12 w-20">
      <polyline
        fill="none"
        stroke="#00bfa5"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

export function AdminOverviewScreen() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="flex">
        <aside className="hidden min-h-screen w-60 flex-col gap-6 border-r border-[#2a2a2a] bg-[#0f0f0f] px-5 py-6 lg:flex">
          <div className="flex items-center gap-3 text-lg font-semibold">
            <div className="h-9 w-9 rounded-xl bg-[#00bfa5]/20 text-[#00bfa5] flex items-center justify-center">
              <ShieldCheck className="h-5 w-5" />
            </div>
            ALLERT Admin
          </div>
          <nav className="space-y-2 text-sm text-[#b0b0b0]">
            <div className="rounded-xl bg-[#1e1e1e] px-3 py-2 text-white">Sensor Network</div>
            <div className="rounded-xl px-3 py-2 hover:bg-[#1e1e1e]">Node Detail</div>
            <div className="rounded-xl px-3 py-2 hover:bg-[#1e1e1e]">Anomaly Review</div>
            <div className="rounded-xl px-3 py-2 hover:bg-[#1e1e1e]">Calibration</div>
            <div className="rounded-xl px-3 py-2 hover:bg-[#1e1e1e]">System Health</div>
          </nav>
          <div className="mt-auto space-y-3 rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4 text-xs text-[#b0b0b0]">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[#00c853]" />
              <span className="text-white">Operational</span>
            </div>
            <div className="font-mono">Last ingest: 2 min ago</div>
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-[#00bfa5]" />
              Model v2.3.1 deployed
            </div>
          </div>
        </aside>

        <main className="flex-1 px-6 py-6">
          <header className="flex flex-col gap-4 rounded-2xl border border-[#2a2a2a] bg-[#141414] px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#00bfa5]/20 text-[#00bfa5] flex items-center justify-center">
                <CloudLightning className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-semibold">Sensor Network Overview</div>
                <div className="text-xs text-[#b0b0b0]">Iloilo Deployment Cluster</div>
              </div>
            </div>
            <div className="flex flex-col gap-3 text-sm text-[#b0b0b0] lg:flex-row lg:items-center">
              <AdminSearchBar className="w-full lg:w-72" />
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#00c853] animate-pulse" />
                  Operational
                </div>
                <div className="font-mono">Last data: 2 min ago</div>
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-[#1e1e1e] flex items-center justify-center">
                    <Signal className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-white">System Admin</div>
                    <div className="text-xs">admin@allert.system</div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <section className="mt-6 grid gap-4 lg:grid-cols-4">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.label}
                  className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5 transition-colors hover:bg-[#1e1e1e]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#b0b0b0]">{kpi.label}</span>
                    <Icon className="h-4 w-4" style={{ color: kpi.accent }} />
                  </div>
                  <div className="mt-3 text-2xl font-semibold">{kpi.value}</div>
                  <div className="mt-1 text-xs text-[#b0b0b0]">{kpi.subtext}</div>
                </div>
              );
            })}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {sensors.map((sensor, index) => (
                <div
                  key={sensor.id}
                  className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5"
                  style={
                    sensor.quality === "INTERPOLATED"
                      ? { borderColor: "#ffd600" }
                      : sensor.quality === "OFFLINE"
                      ? { borderColor: "#ff1744" }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="font-mono text-sm">{sensor.id}</div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          sensor.status === "offline" ? "bg-[#ff1744]" : "bg-[#00c853]"
                        }`}
                      />
                      <Badge label={sensor.quality} />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-[#b0b0b0]">
                    {sensor.location} - {sensor.lastSeen}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-xs text-[#b0b0b0]">
                    {sensor.telemetry.map((value, idx) => (
                      <div key={`${sensor.id}-${idx}`}>
                        <div className="text-white">{value}</div>
                        <div className="text-[10px]">
                          {idx === 0
                            ? "PM2.5"
                            : idx === 1
                            ? "Temp"
                            : idx === 2
                            ? "Humidity"
                            : "PM10"}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <Sparkline points={sparklineSets[index]} />
                    <button className="text-[#00bfa5]">View Detail</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-5">
              <div className="mb-4 text-sm font-semibold">Anomaly Event Log</div>
              <div className="grid gap-3 text-xs text-[#b0b0b0]">
                <div className="grid grid-cols-[70px_90px_1fr_70px_90px_100px] gap-2 text-[11px] uppercase">
                  <span>Time</span>
                  <span>Node</span>
                  <span>Type</span>
                  <span>Z-Score</span>
                  <span>Velocity</span>
                  <span>Status</span>
                </div>
                {anomalies.map((entry) => (
                  <div
                    key={`${entry.time}-${entry.node}`}
                    className="grid grid-cols-[70px_90px_1fr_70px_90px_100px] items-center gap-2 rounded-xl border border-transparent px-2 py-2 hover:border-[#2a2a2a] hover:bg-[#1e1e1e]"
                  >
                    <span className="font-mono text-white">{entry.time}</span>
                    <span className="font-mono">{entry.node}</span>
                    <Badge label={entry.type} />
                    <span>{entry.z}</span>
                    <span>{entry.velocity}</span>
                    <span className="text-white">{entry.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Calibration Drift Monitor</div>
              <div className="text-xs text-[#b0b0b0]">7-day rolling MAE (ug/m3)</div>
            </div>
            <div className="relative h-60 w-full">
              <svg viewBox="0 0 600 220" className="h-full w-full">
                <line
                  x1="0"
                  y1="160"
                  x2="600"
                  y2="160"
                  stroke="#ff1744"
                  strokeDasharray="6 6"
                />
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  points="0,150 100,140 200,132 300,120 400,110 500,100 600,90"
                />
                <polyline
                  fill="none"
                  stroke="#00c853"
                  strokeWidth="2"
                  points="0,160 100,150 200,146 300,140 400,130 500,122 600,110"
                />
                <polyline
                  fill="none"
                  stroke="#9c27b0"
                  strokeWidth="2"
                  points="0,130 100,138 200,140 300,150 400,158 500,162 600,170"
                />
                <polyline
                  fill="none"
                  stroke="#ff9100"
                  strokeWidth="2"
                  points="0,120 100,112 200,118 300,126 400,138 500,148 600,155"
                />
                <circle cx="400" cy="110" r="4" fill="#ff1744" />
              </svg>
              <div className="absolute inset-0 flex items-end justify-between text-[11px] text-[#6b7280]">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                  <span key={label} className="w-[14%] text-center">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
