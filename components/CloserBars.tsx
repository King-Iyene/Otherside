"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

export interface CloserDatum {
  name: string;
  value: number;
}

interface Props {
  title: string;
  items: CloserDatum[];
  valueFormatter?: (v: number) => string;
  maxBars?: number;
  onSelect?: (name: string) => void;
}

// Fixed palette — each coach hashes to a stable slot so the SAME coach is the
// SAME color across every chart on the page (cleaner than position-based color).
const PALETTE = ["#10b981", "#f59e0b", "#a855f7", "#61aaf2", "#f07070", "#14b8a6", "#f2b63c", "#ec4899", "#38bdf8", "#84cc16"];
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** First name / short label for the axis so bars don't get squeezed. */
function shortName(name: string): string {
  const n = name.trim();
  const first = n.split(/\s+/)[0];
  return first.length > 12 ? `${first.slice(0, 11)}…` : first;
}

export default function CloserBars({ title, items, valueFormatter, maxBars = 12, onSelect }: Props) {
  const data = useMemo(
    () =>
      items
        .filter((i) => i.name && i.name.trim())
        .sort((a, b) => b.value - a.value)
        .slice(0, maxBars)
        .map((i) => ({ ...i, short: shortName(i.name), fill: colorFor(i.name) })),
    [items, maxBars]
  );

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        {onSelect && <span style={{ color: "var(--muted)", fontSize: 11 }}>Click a bar to drill down</span>}
      </div>
      {data.length === 0 ? (
        <div className="empty-state">No data in range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 22, right: 8, left: 4, bottom: 4 }} barCategoryGap="28%">
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="short"
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={{ stroke: "var(--line)" }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={54}
              tickFormatter={(v) => (valueFormatter ? valueFormatter(v) : String(v))}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--line-strong)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text)",
                boxShadow: "var(--shadow-lg)",
              }}
              labelStyle={{ color: "var(--text)", fontWeight: 600 }}
              itemStyle={{ color: "var(--text)" }}
              formatter={(v: number) => [valueFormatter ? valueFormatter(v) : v, ""]}
              labelFormatter={(_, payload) => (payload && payload[0] ? payload[0].payload.name : "")}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={54} cursor={onSelect ? "pointer" : undefined} onClick={onSelect ? (d: any) => d && onSelect(d.name) : undefined}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)}
                style={{ fill: "var(--text)", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-mono)" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
