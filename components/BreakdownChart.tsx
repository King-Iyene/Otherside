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
}

const PALETTE = ["#f2b63c", "#61aaf2", "#45d093", "#f07070", "#a48bf2", "#f28b61"];

export default function BreakdownChart({ title, items, valueFormatter, maxBars = 10 }: Props) {
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
              contentStyle={{ background: "#131a22", border: "1px solid #253242", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#e9edf2" }}
              formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)}
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
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
