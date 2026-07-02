"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { bucketKey, parseDateOnly, type BucketGrain } from "@/lib/dates";

export interface ComboPoint {
  date: string | null;
  offers: number;
  sales: number;
}

const GRAINS: BucketGrain[] = ["day", "week", "month"];

export default function ComboChart({ title, points }: { title: string; points: ComboPoint[] }) {
  const [grain, setGrain] = useState<BucketGrain>("week");

  const data = useMemo(() => {
    const buckets = new Map<string, { offers: number; sales: number }>();
    for (const p of points) {
      if (!p.date) continue;
      const d = parseDateOnly(p.date);
      if (!d) continue;
      const key = bucketKey(d, grain);
      const existing = buckets.get(key) || { offers: 0, sales: 0 };
      existing.offers += p.offers;
      existing.sales += p.sales;
      buckets.set(key, existing);
    }
    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([bucket, v]) => ({
        bucket,
        offers: v.offers,
        sales: v.sales,
        closeRate: v.offers > 0 ? v.sales / v.offers : null,
      }));
  }, [points, grain]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        <div className="grain-toggle">
          {GRAINS.map((g) => (
            <button key={g} className={`grain-btn ${grain === g ? "active" : ""}`} onClick={() => setGrain(g)}>
              {g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="empty-state">No sales activity in range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data}>
            <CartesianGrid stroke="#253242" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" tick={{ fill: "#8b98a8", fontSize: 11 }} axisLine={{ stroke: "#253242" }} tickLine={false} />
            <YAxis
              yAxisId="count"
              tick={{ fill: "#8b98a8", fontSize: 11 }}
              axisLine={{ stroke: "#253242" }}
              tickLine={false}
              width={40}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fill: "#8b98a8", fontSize: 11 }}
              axisLine={{ stroke: "#253242" }}
              tickLine={false}
              width={40}
              domain={[0, 1]}
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
              formatter={(v: number, name: string) => (name === "Close Rate" ? `${(v * 100).toFixed(1)}%` : v)}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#8b98a8" }} />
            <Bar yAxisId="count" dataKey="offers" name="Offers Made" fill="#61aaf2" radius={[3, 3, 0, 0]} />
            <Bar yAxisId="count" dataKey="sales" name="Sales Closed" fill="#45d093" radius={[3, 3, 0, 0]} />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="closeRate"
              name="Close Rate"
              stroke="#f2b63c"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
