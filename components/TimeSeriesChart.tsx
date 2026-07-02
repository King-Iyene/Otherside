"use client";

import { useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { bucketKey, parseDateOnly, type BucketGrain } from "@/lib/dates";

export interface SeriesPoint {
  date: string | null;
  value: number;
}

interface Props {
  title: string;
  points: SeriesPoint[];
  color?: string;
  valueFormatter?: (v: number) => string;
}

const GRAINS: BucketGrain[] = ["day", "week", "month"];

export default function TimeSeriesChart({ title, points, color = "#f2b63c", valueFormatter }: Props) {
  const [grain, setGrain] = useState<BucketGrain>("day");

  const data = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const p of points) {
      if (!p.date) continue;
      const d = parseDateOnly(p.date);
      if (!d) continue;
      const key = bucketKey(d, grain);
      buckets.set(key, (buckets.get(key) || 0) + p.value);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, value]) => ({ bucket, value }));
  }, [points, grain]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        <div className="grain-toggle">
          {GRAINS.map((g) => (
            <button
              key={g}
              className={`grain-btn ${grain === g ? "active" : ""}`}
              onClick={() => setGrain(g)}
            >
              {g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="empty-state">No dated records in range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="tsFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#253242" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fill: "#8b98a8", fontSize: 11 }} axisLine={{ stroke: "#253242" }} tickLine={false} />
            <YAxis tick={{ fill: "#8b98a8", fontSize: 11 }} axisLine={{ stroke: "#253242" }} tickLine={false} width={60} />
            <Tooltip
              contentStyle={{ background: "#131a22", border: "1px solid #253242", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#e9edf2" }}
              formatter={(v: number) => (valueFormatter ? valueFormatter(v) : v)}
            />
            <Area type="monotone" dataKey="value" stroke={color} fill="url(#tsFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
