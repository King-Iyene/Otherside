"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

export interface DonutChartProps {
  title: string;
  items: { key: string; value: number; color?: string }[];
  valueFormatter?: (v: number) => string;
  onSelect?: (key: string) => void;
  /** Show as a full pie instead of donut */
  pie?: boolean;
}

const PALETTE = [
  "#2a78d6",
  "#008300",
  "#e87ba4",
  "#eda100",
  "#1baf7a",
  "#eb6834",
  "#4a3aa7",
  "#e34948",
];

const MAX_SEGMENTS = 8;

/** Return true when a hex color is perceptually dark. */
function isDark(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // Relative luminance shortcut
  return r * 0.299 + g * 0.587 + b * 0.114 < 140;
}

export default function DonutChart({
  title,
  items,
  valueFormatter,
  onSelect,
  pie = false,
}: DonutChartProps) {
  const { data, total } = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.value - a.value);
    let segments: { name: string; value: number; color: string; key: string }[];

    if (sorted.length <= MAX_SEGMENTS) {
      segments = sorted.map((item, idx) => ({
        name: item.key,
        value: item.value,
        color: item.color || PALETTE[idx % PALETTE.length],
        key: item.key,
      }));
    } else {
      const top = sorted.slice(0, MAX_SEGMENTS - 1);
      const rest = sorted.slice(MAX_SEGMENTS - 1);
      const otherValue = rest.reduce((sum, i) => sum + i.value, 0);
      segments = top.map((item, idx) => ({
        name: item.key,
        value: item.value,
        color: item.color || PALETTE[idx % PALETTE.length],
        key: item.key,
      }));
      segments.push({
        name: "Other",
        value: otherValue,
        color: PALETTE[(MAX_SEGMENTS - 1) % PALETTE.length],
        key: "Other",
      });
    }

    const total = segments.reduce((sum, s) => sum + s.value, 0);
    return { data: segments, total };
  }, [items]);

  const renderLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
    index,
  }: any) => {
    if (percent < 0.08) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const fill = isDark(data[index].color) ? "#ffffff" : "var(--text)";

    return (
      <text
        x={x}
        y={y}
        fill={fill}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={600}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const formatted = valueFormatter ? valueFormatter(total) : String(total);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{title}</div>
        {onSelect && (
          <span style={{ color: "var(--muted)", fontSize: 11 }}>
            Click a segment to see details
          </span>
        )}
      </div>
      {data.length === 0 ? (
        <div className="empty-state">No data in range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={pie ? 0 : "55%"}
              outerRadius="80%"
              labelLine={false}
              label={renderLabel}
              cursor={onSelect ? "pointer" : undefined}
              onClick={
                onSelect ? (d: any) => d && onSelect(d.key) : undefined
              }
            >
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={entry.color}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            {!pie && (
              <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--text)"
                fontSize={20}
                fontWeight={700}
              >
                {formatted}
              </text>
            )}
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
              formatter={(v: number) =>
                valueFormatter ? valueFormatter(v) : v
              }
            />
            <Legend
              verticalAlign="bottom"
              wrapperStyle={{ color: "var(--text)", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
