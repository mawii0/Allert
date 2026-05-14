import { useMemo } from "react";

interface DataPoint {
  [key: string]: any;
}

interface LineConfig {
  dataKey: string;
  stroke: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  name?: string;
  yAxisId?: string;
  dot?: boolean;
  dotRadius?: number;
}

interface YAxisConfig {
  id: string;
  orientation?: "left" | "right";
  domain: [number | string, number | string];
  stroke?: string;
  label?: string;
}

interface CustomLineChartProps {
  data: DataPoint[];
  lines: LineConfig[];
  xAxisKey: string;
  yAxes?: YAxisConfig[];
  height?: number;
  showGrid?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
}

export function CustomLineChart({
  data,
  lines,
  xAxisKey,
  yAxes = [{ id: "default", domain: ["dataMin", "dataMax"] }],
  height = 220,
  showGrid = true,
  showTooltip = true,
  showLegend = true,
}: CustomLineChartProps) {
  const chartDimensions = useMemo(() => {
    const padding = { top: 10, right: 50, bottom: 30, left: 50 };
    const width = 100; // Will use percentage in viewBox
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    return { padding, width, chartWidth, chartHeight, height };
  }, [height]);

  // Calculate scales for each y-axis
  const yAxisScales = useMemo(() => {
    return yAxes.map((axis) => {
      let min: number, max: number;

      // Get all data points for lines using this axis
      const relevantLines = lines.filter(
        (line) => (line.yAxisId || "default") === axis.id
      );
      const values = data.flatMap((point) =>
        relevantLines.map((line) => Number(point[line.dataKey]) || 0)
      );

      if (axis.domain[0] === "dataMin") {
        min = Math.min(...values);
      } else {
        min = Number(axis.domain[0]);
      }

      if (axis.domain[1] === "dataMax") {
        max = Math.max(...values);
      } else {
        max = Number(axis.domain[1]);
      }

      // Add 10% padding
      const padding = (max - min) * 0.1;
      return {
        id: axis.id,
        min: min - padding,
        max: max + padding,
        range: max - min + padding * 2,
      };
    });
  }, [data, lines, yAxes]);

  // Convert data value to SVG y coordinate
  const getY = (value: number, yAxisId: string = "default") => {
    const scale = yAxisScales.find((s) => s.id === yAxisId);
    if (!scale) return 0;

    const normalized = (value - scale.min) / scale.range;
    return chartDimensions.chartHeight * (1 - normalized);
  };

  // Generate path for a line
  const generatePath = (line: LineConfig) => {
    const points = data.map((point, i) => {
      const x =
        (i / (data.length - 1 || 1)) * chartDimensions.chartWidth;
      const y = getY(
        Number(point[line.dataKey]) || 0,
        line.yAxisId || "default"
      );
      return { x, y, value: point[line.dataKey] };
    });

    const pathD = points
      .map((point, i) => `${i === 0 ? "M" : "L"} ${point.x},${point.y}`)
      .join(" ");

    return { path: pathD, points };
  };

  // Hover state
  const [hoveredIndex, setHoveredIndex] = 
    useMemo(() => {
      let index: number | null = null;
      const setIndex = (i: number | null) => (index = i);
      return [index, setIndex];
    }, []);

  return (
    <div className="relative w-full" style={{ height: `${height}px` }}>
      <svg
        viewBox={`0 0 ${chartDimensions.width} ${chartDimensions.height}`}
        className="w-full h-full"
        style={{ overflow: "visible" }}
      >
        <g
          transform={`translate(${chartDimensions.padding.left}, ${chartDimensions.padding.top})`}
        >
          {/* Grid */}
          {showGrid && (
            <g className="grid">
              {[...Array(5)].map((_, i) => {
                const y = (chartDimensions.chartHeight / 4) * i;
                return (
                  <line
                    key={`grid-h-${i}`}
                    x1={0}
                    y1={y}
                    x2={chartDimensions.chartWidth}
                    y2={y}
                    stroke="#3f3f46"
                    strokeDasharray="3 3"
                    strokeWidth={0.5}
                  />
                );
              })}
              {[...Array(7)].map((_, i) => {
                const x = (chartDimensions.chartWidth / 6) * i;
                return (
                  <line
                    key={`grid-v-${i}`}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={chartDimensions.chartHeight}
                    stroke="#3f3f46"
                    strokeDasharray="3 3"
                    strokeWidth={0.5}
                  />
                );
              })}
            </g>
          )}

          {/* Lines */}
          {lines.map((line, lineIndex) => {
            const { path, points } = generatePath(line);
            return (
              <g key={`line-${lineIndex}-${line.dataKey}`}>
                <path
                  d={path}
                  fill="none"
                  stroke={line.stroke}
                  strokeWidth={line.strokeWidth || 2}
                  strokeDasharray={line.strokeDasharray}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Dots */}
                {line.dot !== false &&
                  points.map((point, i) => (
                    <circle
                      key={`dot-${lineIndex}-${i}`}
                      cx={point.x}
                      cy={point.y}
                      r={line.dotRadius || 4}
                      fill={line.stroke}
                      stroke="transparent"
                      className="transition-all"
                    />
                  ))}
              </g>
            );
          })}

          {/* X-Axis */}
          <g transform={`translate(0, ${chartDimensions.chartHeight})`}>
            <line
              x1={0}
              y1={0}
              x2={chartDimensions.chartWidth}
              y2={0}
              stroke="#71717a"
              strokeWidth={1}
            />
            {data.map((point, i) => {
              const x = (i / (data.length - 1 || 1)) * chartDimensions.chartWidth;
              return (
                <text
                  key={`x-label-${i}`}
                  x={x}
                  y={15}
                  textAnchor="middle"
                  fill="#71717a"
                  fontSize="10"
                >
                  {point[xAxisKey]}
                </text>
              );
            })}
          </g>

          {/* Y-Axes */}
          {yAxes.map((axis, axisIndex) => {
            const isRight = axis.orientation === "right";
            const x = isRight ? chartDimensions.chartWidth : 0;
            const scale = yAxisScales[axisIndex];

            return (
              <g key={`y-axis-${axis.id}`}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={chartDimensions.chartHeight}
                  stroke={axis.stroke || "#71717a"}
                  strokeWidth={1}
                />
                {/* Tick labels */}
                {[...Array(5)].map((_, i) => {
                  const y = (chartDimensions.chartHeight / 4) * i;
                  const value = scale.max - (scale.range / 4) * i;
                  return (
                    <text
                      key={`y-tick-${axis.id}-${i}`}
                      x={isRight ? x + 5 : x - 5}
                      y={y + 3}
                      textAnchor={isRight ? "start" : "end"}
                      fill="#71717a"
                      fontSize="10"
                    >
                      {value.toFixed(axis.id === "left" ? 2 : 0)}
                    </text>
                  );
                })}
                {/* Axis label */}
                {axis.label && (
                  <text
                    x={isRight ? x + 35 : x - 35}
                    y={chartDimensions.chartHeight / 2}
                    textAnchor="middle"
                    fill="#71717a"
                    fontSize="10"
                    transform={`rotate(${isRight ? 90 : -90}, ${
                      isRight ? x + 35 : x - 35
                    }, ${chartDimensions.chartHeight / 2})`}
                  >
                    {axis.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      {showLegend && (
        <div className="flex items-center justify-center gap-4 mt-2">
          {lines.map((line, i) => (
            <div key={`legend-${i}`} className="flex items-center gap-2">
              <div
                className="w-4 h-0.5 rounded"
                style={{
                  backgroundColor: line.stroke,
                  opacity: line.strokeDasharray ? 0.7 : 1,
                }}
              />
              <span className="text-xs text-zinc-400">
                {line.name || line.dataKey}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
