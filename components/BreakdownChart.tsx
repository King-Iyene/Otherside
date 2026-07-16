"use client";

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export interface BreakdownItem {
  key: string | null;
  value: number;
}

interface Props {
  title: string;
  items: BreakdownItem[];
  color?: string;
  valueFormatter?: (v: number) => string;
  maxBars?: number;
  /** When provided, bars become clickable and this fires with the bar's key. */
  onSelect?: (key: string) => void;
}

const PALETTE = ["#FF9C26", "#10b981", "#FF4400", "#61aaf2", "#a48bf2", "#f07070"];

export default function BreakdownChart({ title, items, valueFormatter, maxBars = 10, onSelect }: Props) {
  const data = useMemo(() => {
    return items
      .map((i) => ({ name: i.key || "(none)", value: i.value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, maxBars);
  }, [items, maxBars]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        {onSelect && <span style={{ color: "var(--muted)", fontSize: 11 }}>Click a bar to see the leads</span>}
      </div>
      {data.length === 0 ? (
        <div className="empty-state">No data in range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#253242" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fill: "#8b98a8", fontSize: 11 }} axisLine={{ stroke: "#253242" }} tickLine={false} />
            <YAxis
              dataKey="name"
              type="category"
              width={110}
              tick={{ fill: "#8b98a8", fontSize: 11 }}
              axisLine={{ stroke: "#253242" }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface-2)",
                border: "1px solid var(--line-strong)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--text)",
                boxShadow: "0 12px 30px -12px rgba(0,0,0,0.5)",
              }}
              labelStyle={{ color: "var(--text)", fontWeight: 600 }}
              itemStyle={{ color: "var(--text)" }}
              formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              cursor={onSelect ? "pointer" : undefined}
              onClick={onSelect ? (d: any) => d && onSelect(d.name) : undefined}
            >
              {data.map((_, idx) => (
                <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
