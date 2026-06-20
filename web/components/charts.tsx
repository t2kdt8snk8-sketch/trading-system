"use client";

import {
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CurvePoint, SectorWeight } from "@/lib/types";

const SECTOR_COLORS = [
  "#5b8cff", "#1faa6b", "#f5a524", "#e5484d", "#a06bff",
  "#22b8cf", "#f06595", "#94d82d", "#ff922b", "#748ffc",
  "#4cd0c0",
];

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
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <XAxis
          dataKey="date"
          tick={{ fill: "#7c8499", fontSize: 11 }}
          minTickGap={48}
          tickFormatter={(d: string) => d.slice(0, 7)}
        />
        <YAxis
          tick={{ fill: "#7c8499", fontSize: 11 }}
          width={48}
          tickFormatter={(v: number) => `${v.toFixed(1)}x`}
        />
        <Tooltip
          contentStyle={{
            background: "#11151f",
            border: "1px solid #252d42",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#a8b0c0" }}
          formatter={(v: number) => (v == null ? "—" : `${v.toFixed(3)}x`)}
        />
        <Line
          type="monotone"
          dataKey="strategy"
          name="전략"
          stroke="#5b8cff"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="benchmark"
          name="SPY"
          stroke="#8b93a7"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SectorDonut({ data }: { data: SectorWeight[] }) {
  const clean = data.filter((d) => d.weight && d.weight > 0);
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={clean}
          dataKey="weight"
          nameKey="sector"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          stroke="#0b0e14"
        >
          {clean.map((_, i) => (
            <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "#11151f",
            border: "1px solid #252d42",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v: number, n: string) => [`${(v * 100).toFixed(1)}%`, n]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export { SECTOR_COLORS };
