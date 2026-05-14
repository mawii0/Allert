import { useMemo } from "react";

interface SparklineProps {
  data: { value: number }[];
  color: string;
  height?: number;
  strokeWidth?: number;
  showDots?: boolean;
}

export function CustomSparkline({
  data,
  color,
  height = 60,
  strokeWidth = 2,
  showDots = false,
}: SparklineProps) {
  const { path, points, min, max } = useMemo(() => {
    if (data.length === 0) {
      return { path: "", points: [], min: 0, max: 0 };
    }

    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const width = 100; // percentage-based
    const padding = 4;
    const effectiveHeight = height - padding * 2;

    const points = data.map((point, i) => {
      const x = (i / (data.length - 1 || 1)) * width;
      const normalized = (point.value - min) / range;
      const y = effectiveHeight * (1 - normalized) + padding;
      return { x, y, value: point.value };
    });

    const pathD = points
      .map((point, i) => `${i === 0 ? "M" : "L"} ${point.x},${point.y}`)
      .join(" ");

    return { path: pathD, points, min, max };
  }, [data, height]);

  // Extract color value from Tailwind class
  const strokeColor = useMemo(() => {
    const colorMap: { [key: string]: string } = {
      "text-orange-400": "#fb923c",
      "text-blue-400": "#60a5fa",
      "text-cyan-400": "#22d3ee",
      "text-emerald-400": "#34d399",
      "text-yellow-400": "#facc15",
      "text-red-400": "#f87171",
    };
    return colorMap[color] || "#71717a";
  }, [color]);

  if (data.length === 0) {
    return (
      <div
        className="w-full flex items-center justify-center text-zinc-600"
        style={{ height: `${height}px` }}
      >
        No data
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      className="w-full"
      style={{ height: `${height}px` }}
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showDots &&
        points.map((point, i) => (
          <circle
            key={`sparkline-dot-${i}`}
            cx={point.x}
            cy={point.y}
            r={2}
            fill={strokeColor}
            vectorEffect="non-scaling-stroke"
          />
        ))}
    </svg>
  );
}
