import {
  Clipboard,
  Download,
  Gauge,
  LineChart,
  MapPin,
  RefreshCw,
  Signal,
  Thermometer,
  Wifi,
} from "lucide-react";
import { AdminSearchBar } from "./AdminSearchBar";

const metadataSections = [
  {
    title: "Identity",
    items: [
      { label: "Node ID", value: "ilo-node-01" },
      { label: "Location", value: "Iloilo City Proper" },
      { label: "Hardware Rev", value: "SPS30-R2" },
      { label: "Firmware", value: "v1.7.4" },
    ],
  },
  {
    title: "Hardware",
    items: [
      { label: "SPS30 Serial", value: "SPS30-89211" },
      { label: "SHT40 Serial", value: "SHT40-55102" },
      { label: "ESP32-S3", value: "ESP-S3-881" },
    ],
  },
  {
    title: "Calibration",
    items: [
      { label: "Last Co-Location", value: "2026-04-18" },
      { label: "R2 vs DENR-EMB", value: "0.92" },
      { label: "Post-cal MAE", value: "3.1 ug/m3" },
      { label: "Next Calibration", value: "2026-06-05" },
    ],
  },
  {
    title: "Operational",
    items: [
      { label: "Uptime", value: "182 days" },
      { label: "Measurements", value: "1,203,440" },
      { label: "Last Reboot", value: "2026-05-12 02:11" },
      { label: "WiFi", value: "-62 dBm" },
    ],
  },
];

const gauges = [
  {
    label: "PM2.5",
    value: "45 ug/m3",
    trend: "+12% (1h)",
    status: "Moderate",
    color: "#ffd600",
    icon: Gauge,
  },
  {
    label: "PM10",
    value: "58 ug/m3",
    trend: "+8% (1h)",
    status: "Low",
    color: "#00c853",
    icon: Gauge,
  },
  {
    label: "Temperature",
    value: "28 C",
    trend: "+2 C (1h)",
    status: "Normal",
    color: "#00c853",
    icon: Thermometer,
  },
  {
    label: "Humidity",
    value: "72%",
    trend: "Stable",
    status: "Normal",
    color: "#00c853",
    icon: LineChart,
  },
];

const forecastRows = [
  {
    horizon: "6h",
    mae: "2.3 ug/m3",
    rmse: "3.1 ug/m3",
    mape: "4.8%",
    status: "Under 5% target",
    badge: "#00c853",
  },
  {
    horizon: "12h",
    mae: "4.1 ug/m3",
    rmse: "5.6 ug/m3",
    mape: "7.2%",
    status: "Near 7% target",
    badge: "#f59e0b",
  },
  {
    horizon: "24h",
    mae: "6.8 ug/m3",
    rmse: "9.2 ug/m3",
    mape: "11.3%",
    status: "Exceeds 10% target",
    badge: "#ff1744",
  },
];

function GaugeCard({
  label,
  value,
  trend,
  status,
  color,
  icon: Icon,
}: (typeof gauges)[number]) {
  return (
    <div className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#b0b0b0]">{label}</span>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="relative h-16 w-16">
          <svg viewBox="0 0 72 72" className="h-full w-full">
            <circle
              cx="36"
              cy="36"
              r="28"
              fill="none"
              stroke="#2a2a2a"
              strokeWidth="6"
            />
            <circle
              cx="36"
              cy="36"
              r="28"
              fill="none"
              stroke={color}
              strokeWidth="6"
              strokeDasharray="175"
              strokeDashoffset="40"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
            {status}
          </div>
        </div>
        <div>
          <div className="text-lg font-semibold">{value}</div>
          <div className="text-xs text-[#b0b0b0]">{trend}</div>
        </div>
      </div>
    </div>
  );
}

export function AdminSensorDetailScreen() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-6 px-6 py-6 lg:flex-row">
        <aside className="w-full shrink-0 rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6 lg:w-[360px]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[#b0b0b0]">Sensor Detail</div>
              <div className="text-lg font-semibold">ilo-node-01</div>
            </div>
            <div className="flex items-center gap-2 text-[#b0b0b0]">
              <MapPin className="h-4 w-4" />
              Iloilo City Proper
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {metadataSections.map((section) => (
              <div key={section.title}>
                <div className="mb-3 text-sm font-semibold">{section.title}</div>
                <div className="space-y-2 text-sm text-[#b0b0b0]">
                  {section.items.map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span>{item.label}</span>
                      <span className="text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <button className="w-full rounded-xl bg-[#00bfa5] px-4 py-2 text-sm font-semibold text-[#0a0a0a]">
              Trigger Remote Calibration
            </button>
            <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#2a2a2a] px-4 py-2 text-sm">
              <Download className="h-4 w-4" />
              Download Raw Data (CSV)
            </button>
            <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ff1744]/40 bg-[#ff1744]/10 px-4 py-2 text-sm text-[#ff1744]">
              Flag for Maintenance
            </button>
          </div>
        </aside>

        <main className="flex-1 space-y-6">
          <header className="flex flex-col gap-3 rounded-2xl border border-[#2a2a2a] bg-[#141414] px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs text-[#b0b0b0]">Realtime Telemetry</div>
              <div className="text-lg font-semibold">Node Status - Operational</div>
            </div>
            <AdminSearchBar className="w-full lg:w-80" />
            <div className="flex items-center gap-3 text-xs text-[#b0b0b0]">
              <Wifi className="h-4 w-4" />
              -62 dBm
              <Signal className="h-4 w-4" />
              99.1% uptime
            </div>
          </header>

          <section className="grid gap-4 lg:grid-cols-4">
            {gauges.map((gauge) => (
              <GaugeCard key={gauge.label} {...gauge} />
            ))}
          </section>

          <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">24-Hour Trend</div>
                <div className="text-xs text-[#b0b0b0]">PM2.5, PM10, Temperature, Humidity</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#b0b0b0]">
                <RefreshCw className="h-4 w-4" />
                Live feed
              </div>
            </div>
            <div className="mt-4 h-[320px] rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] p-4">
              <svg viewBox="0 0 680 280" className="h-full w-full">
                <polyline
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  points="0,180 80,160 160,140 240,150 320,120 400,110 480,130 560,120 640,140"
                />
                <polyline
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="2"
                  points="0,210 80,200 160,190 240,200 320,180 400,170 480,190 560,200 640,210"
                />
                <polyline
                  fill="none"
                  stroke="#ff9100"
                  strokeWidth="2"
                  points="0,130 80,120 160,110 240,130 320,100 400,90 480,110 560,100 640,120"
                />
                <polyline
                  fill="none"
                  stroke="#00c853"
                  strokeWidth="2"
                  points="0,90 80,95 160,92 240,100 320,88 400,80 480,85 560,90 640,100"
                />
              </svg>
              <div className="mt-2 flex justify-between text-[11px] text-[#6b7280]">
                {[
                  "00:00",
                  "04:00",
                  "08:00",
                  "12:00",
                  "16:00",
                  "20:00",
                ].map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="text-sm font-semibold">Data Quality Timeline</div>
            <div
              className="mt-4 grid gap-1"
              style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}
            >
              {Array.from({ length: 24 }).map((_, idx) => {
                const color =
                  idx >= 14 && idx <= 17
                    ? "bg-[#ff9100]"
                    : idx === 20
                    ? "bg-[#ff1744]"
                    : idx % 6 === 0
                    ? "bg-[#ffd600]"
                    : "bg-[#00c853]";
                return <div key={idx} className={`h-4 rounded-sm ${color}`} />;
              })}
            </div>
            <div className="mt-2 text-xs text-[#b0b0b0]">24h timeline, 1h segments</div>
          </section>

          <section className="rounded-2xl border border-[#2a2a2a] bg-[#141414] p-6">
            <div className="mb-4 text-sm font-semibold">Forecast Accuracy Tracker</div>
            <div className="grid gap-2 text-xs text-[#b0b0b0]">
              <div className="grid grid-cols-[70px_120px_120px_120px_1fr] gap-2 text-[11px] uppercase">
                <span>Horizon</span>
                <span>MAE</span>
                <span>RMSE</span>
                <span>MAPE</span>
                <span>Status</span>
              </div>
              {forecastRows.map((row) => (
                <div
                  key={row.horizon}
                  className="grid grid-cols-[70px_120px_120px_120px_1fr] items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#0f0f0f] px-3 py-2"
                >
                  <span className="font-mono text-white">{row.horizon}</span>
                  <span>{row.mae}</span>
                  <span>{row.rmse}</span>
                  <span>{row.mape}</span>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: row.badge }}
                    />
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
