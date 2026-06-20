"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  LabelList,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CurvePoint, SectorWeight } from "@/lib/types";
import { drawdownSeries, monthlyReturns } from "@/lib/metrics";

const C = {
  brand: "#22d3ee",
  up: "#34d399",
  down: "#fb7185",
  bench: "#7c8699",
  violet: "#a78bfa",
  grid: "#222a35",
  axis: "#5c6675",
};

const SECTOR_COLORS = [
  "#22d3ee", "#34d399", "#a78bfa", "#fbbf24", "#fb7185",
  "#60a5fa", "#f472b6", "#a3e635", "#fb923c", "#2dd4bf",
  "#818cf8",
];

const tooltipStyle = {
  background: "#12151b",
  border: "1px solid #232a35",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 8px 24px -12px rgba(0,0,0,0.7)",
};

/* ── Hero: cumulative performance, strategy vs benchmark ─────────────── */
export function CumulativeChart({
  strategy,
  benchmark,
  height = 280,
}: {
  strategy: CurvePoint[];
  benchmark: CurvePoint[];
  height?: number;
}) {
  const benchMap = new Map(benchmark.map((p) => [p.date, p.value]));
  const data = strategy.map((p) => ({
    date: p.date,
    strategy: p.value,
    benchmark: benchMap.get(p.date) ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="stratFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.brand} stopOpacity={0.32} />
            <stop offset="100%" stopColor={C.brand} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: C.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: C.grid }}
          minTickGap={44}
          tickFormatter={(d: string) => d.slice(0, 7)}
        />
        <YAxis
          tick={{ fill: C.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => `${v.toFixed(1)}x`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#94a0b0", marginBottom: 4 }}
          formatter={(v: number, n: string) => [
            v == null ? "—" : `${v.toFixed(3)}x`,
            n === "strategy" ? "전략" : "SPY",
          ]}
        />
        <Area
          type="monotone"
          dataKey="strategy"
          name="strategy"
          stroke={C.brand}
          strokeWidth={2.4}
          fill="url(#stratFill)"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="benchmark"
          name="benchmark"
          stroke={C.bench}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Underwater drawdown (shares the equity x-axis visually) ─────────── */
export function DrawdownChart({
  strategy,
  height = 130,
}: {
  strategy: CurvePoint[];
  height?: number;
}) {
  const data = drawdownSeries(strategy);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.down} stopOpacity={0} />
            <stop offset="100%" stopColor={C.down} stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: C.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: C.grid }}
          minTickGap={44}
          tickFormatter={(d: string) => d.slice(0, 7)}
        />
        <YAxis
          tick={{ fill: C.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: "#94a0b0", marginBottom: 4 }}
          formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, "낙폭"]}
        />
        <Area
          type="monotone"
          dataKey="dd"
          stroke={C.down}
          strokeWidth={1.6}
          fill="url(#ddFill)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Monthly returns bars (green up / red down) ──────────────────────── */
export function MonthlyReturnsBars({
  strategy,
  height = 150,
}: {
  strategy: CurvePoint[];
  height?: number;
}) {
  const data = monthlyReturns(strategy);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -12 }}>
        <XAxis
          dataKey="month"
          tick={{ fill: C.axis, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: C.grid }}
          minTickGap={28}
        />
        <YAxis
          tick={{ fill: C.axis, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={tooltipStyle}
          formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "월수익"]}
        />
        <ReferenceLine y={0} stroke={C.grid} />
        <Bar dataKey="ret" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.ret >= 0 ? C.up : C.down} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Per-rebalance net return bars ───────────────────────────────────── */
export function RebalanceBars({
  data,
  height = 150,
}: {
  data: { date: string; net: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -12 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: C.axis, fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: C.grid }}
          minTickGap={20}
          tickFormatter={(d: string) => d.slice(2, 7)}
        />
        <YAxis
          tick={{ fill: C.axis, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={tooltipStyle}
          formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "순수익"]}
        />
        <ReferenceLine y={0} stroke={C.grid} />
        <Bar dataKey="net" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.net >= 0 ? C.up : C.down} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Risk/return radar: strategy vs SPY across normalized axes ───────── */
export function RiskRadar({
  axes,
  height = 230,
}: {
  axes: { metric: string; strat: number; bench: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={axes} outerRadius="72%">
        <PolarGrid stroke={C.grid} />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fill: "#94a0b0", fontSize: 11 }}
        />
        <Radar
          name="SPY"
          dataKey="bench"
          stroke={C.bench}
          fill={C.bench}
          fillOpacity={0.12}
          strokeWidth={1.5}
        />
        <Radar
          name="전략"
          dataKey="strat"
          stroke={C.brand}
          fill={C.brand}
          fillOpacity={0.28}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, n: string) => [`${(v * 100).toFixed(0)}`, n]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/* ── Radial gauge for a single 0–1 ratio ─────────────────────────────── */
export function GaugeRing({
  value,
  label,
  sublabel,
  color = C.brand,
}: {
  value: number; // 0..1
  label: string;
  sublabel?: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const data = [{ name: label, value: pct * 100, fill: color }];
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={170}>
        <RadialBarChart
          data={data}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <defs />
          <RadialBar
            background={{ fill: "#1b2029" }}
            dataKey="value"
            cornerRadius={20}
          />
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            tick={false}
            axisLine={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="nums text-2xl font-bold" style={{ color }}>
          {label}
        </span>
        {sublabel ? (
          <span className="mt-0.5 text-[11px] text-faint">{sublabel}</span>
        ) : null}
      </div>
    </div>
  );
}

/* ── Allocation donut ────────────────────────────────────────────────── */
export function SectorDonut({
  data,
  height = 200,
}: {
  data: SectorWeight[];
  height?: number;
}) {
  const clean = data.filter((d) => d.weight && d.weight > 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={clean}
          dataKey="weight"
          nameKey="sector"
          innerRadius="60%"
          outerRadius="92%"
          paddingAngle={2}
          stroke="#0a0c10"
          strokeWidth={2}
        >
          {clean.map((_, i) => (
            <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, n: string) => [`${(v * 100).toFixed(1)}%`, n]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

/* ── Horizontal ranking bars (e.g. holdings by weight) ───────────────── */
export function HBars({
  data,
  height,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1e-6);
  return (
    <ResponsiveContainer width="100%" height={height ?? data.length * 26 + 8}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 40, bottom: 0, left: 6 }}
      >
        <XAxis type="number" hide domain={[0, max * 1.15]} />
        <YAxis
          type="category"
          dataKey="label"
          width={56}
          tick={{ fill: "#cbd3df", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={tooltipStyle}
          formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "비중"]}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={C.brand} barSize={13}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
            style={{ fill: "#94a0b0", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Signed horizontal bars (e.g. excess return per variant) ─────────── */
export function SignedHBars({
  data,
  height,
}: {
  data: { label: string; value: number }[];
  height?: number;
}) {
  const span = Math.max(...data.map((d) => Math.abs(d.value)), 1e-6) * 1.25;
  return (
    <ResponsiveContainer width="100%" height={height ?? data.length * 34 + 16}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, bottom: 0, left: 6 }}
      >
        <XAxis type="number" hide domain={[-span, span]} />
        <YAxis
          type="category"
          dataKey="label"
          width={68}
          tick={{ fill: "#cbd3df", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={tooltipStyle}
          formatter={(v: number) => [
            `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`,
            "초과수익",
          ]}
        />
        <ReferenceLine x={0} stroke={C.grid} />
        <Bar dataKey="value" radius={[3, 3, 3, 3]} barSize={16}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? C.up : C.down} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`}
            style={{ fill: "#94a0b0", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Grouped two-series bars (e.g. development vs OOS) ────────────────── */
export function GroupedBars({
  data,
  height = 200,
}: {
  data: { metric: string; dev: number; oos: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
        <XAxis
          dataKey="metric"
          tick={{ fill: C.axis, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: C.grid }}
        />
        <YAxis
          tick={{ fill: C.axis, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={tooltipStyle}
          formatter={(v: number, n: string) => [
            `${(v * 100).toFixed(1)}%`,
            n === "dev" ? "개발" : "OOS",
          ]}
        />
        <ReferenceLine y={0} stroke={C.grid} />
        <Bar dataKey="dev" name="dev" fill={C.brand} radius={[3, 3, 0, 0]} />
        <Bar dataKey="oos" name="oos" fill={C.violet} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export { SECTOR_COLORS };
