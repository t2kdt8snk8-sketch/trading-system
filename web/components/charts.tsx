"use client";

import {
  Area,
  AreaChart,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CurvePoint, SectorWeight } from "@/lib/types";

const SECTOR_COLORS = [
  "#34d399", "#60a5fa", "#fbbf24", "#fb7185", "#a78bfa",
  "#22d3ee", "#f472b6", "#a3e635", "#fb923c", "#818cf8",
  "#2dd4bf",
];

const tooltipStyle = {
  background: "#12151b",
  border: "1px solid #232a35",
  borderRadius: 12,
  fontSize: 12,
  boxShadow: "0 8px 24px -12px rgba(0,0,0,0.7)",
};

export function EquityChart({
  strategy,
  benchmark,
}: {
  strategy: CurvePoint[];
  benchmark: CurvePoint[];
}) {
  const benchMap = new Map(benchmark.map((p) => [p.date, p.value]));
  const data = strategy.map((p) => ({
    date: p.date,
    strategy: p.value,
    benchmark: benchMap.get(p.date) ?? null,
  }));
  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -10 }}>
        <defs>
          <linearGradient id="stratFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fill: "#5c6675", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "#232a35" }}
          minTickGap={44}
          tickFormatter={(d: string) => d.slice(0, 7)}
        />
        <YAxis
          tick={{ fill: "#5c6675", fontSize: 11 }}
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
          stroke="#34d399"
          strokeWidth={2.4}
          fill="url(#stratFill)"
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="benchmark"
          name="benchmark"
          stroke="#6b7686"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SectorDonut({ data }: { data: SectorWeight[] }) {
  const clean = data.filter((d) => d.weight && d.weight > 0);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={clean}
          dataKey="weight"
          nameKey="sector"
          innerRadius={58}
          outerRadius={92}
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

export { SECTOR_COLORS };
