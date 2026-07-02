"use client";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import { fmtMoney, fmtInt } from "@/lib/format";

const AXIS = { stroke: "#5d6b7c", fontSize: 11 };
const GRID = "#1d2833";
const TOOLTIP_STYLE = {
  background: "#1a2430", border: "1px solid #253242", borderRadius: 8,
  fontSize: 12.5, color: "#e9edf2",
};

export const COLORS = {
  gold: "#f2b63c", green: "#45d093", red: "#f07070", blue: "#61aaf2",
  purple: "#a789f0", muted: "#8b98a8",
};
const PALETTE = [COLORS.gold, COLORS.blue, COLORS.green, COLORS.purple, COLORS.red, COLORS.muted, "#e08b52", "#5ecfd6"];

function money(v: any) { return typeof v === "number" ? fmtMoney(v) : v; }
function int(v: any) { return typeof v === "number" ? fmtInt(v) : v; }

export function TimeAreaChart({
  data, series, isMoney = false, height = 260,
}: {
  data: Record<string, any>[];
  series: { key: string; name: string; color: string }[];
  isMoney?: boolean;
  height?: number;
}) {
  if (data.length === 0) return <div className="empty">No dated rows in this range.</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={isMoney ? money : int} width={isMoney ? 70 : 40} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => (isMoney ? money(v) : int(v))} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color}
            strokeWidth={2} fill={`url(#grad-${s.key})`} dot={false} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function TimeLineChart({
  data, series, height = 260,
}: {
  data: Record<string, any>[];
  series: { key: string; name: string; color: string }[];
  height?: number;
}) {
  if (data.length === 0) return <div className="empty">No dated rows in this range.</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={int} width={40} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={int} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BreakdownBars({
  data, isMoney = false, height = 260, horizontal = false, color,
}: {
  data: { name: string; value: number }[];
  isMoney?: boolean;
  height?: number;
  horizontal?: boolean;
  color?: string;
}) {
  if (data.length === 0) return <div className="empty">Nothing to show for this range.</div>;
  const fmt = isMoney ? money : int;
  if (horizontal) {
    const h = Math.max(height, data.length * 34 + 40);
    return (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} />
          <YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={170} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmt} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {data.map((_, i) => <Cell key={i} fill={color ?? PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={data.length > 6 ? -20 : 0} textAnchor={data.length > 6 ? "end" : "middle"} height={data.length > 6 ? 60 : 30} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmt} width={isMoney ? 70 : 40} />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmt} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
          {data.map((_, i) => <Cell key={i} fill={color ?? PALETTE[i % PALETTE.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
