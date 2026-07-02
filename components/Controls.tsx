"use client";

import type { RangePreset } from "@/lib/dates";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "all", label: "All" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "mtd", label: "MTD" },
  { key: "ytd", label: "YTD" },
  { key: "custom", label: "Custom" },
];

export interface DimensionFilter {
  key: string;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}

interface Props {
  preset: RangePreset;
  onPresetChange: (p: RangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  dimensions?: DimensionFilter[];
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder?: string;
  includeTest: boolean;
  onIncludeTestChange: (v: boolean) => void;
}

export default function Controls({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  dimensions = [],
  search,
  onSearchChange,
  searchPlaceholder,
  includeTest,
  onIncludeTestChange,
}: Props) {
  return (
    <div className="controls-bar">
      <div className="control-group">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`preset-btn ${preset === p.key ? "active" : ""}`}
            onClick={() => onPresetChange(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="control-group">
          <input
            type="date"
            className="date-input"
            value={customFrom}
            onChange={(e) => onCustomFromChange(e.target.value)}
          />
          <input
            type="date"
            className="date-input"
            value={customTo}
            onChange={(e) => onCustomToChange(e.target.value)}
          />
        </div>
      )}

      {dimensions.map((d) => (
        <select key={d.key} className="select-input" value={d.value} onChange={(e) => d.onChange(e.target.value)}>
          <option value="">{d.label}: All</option>
          {d.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ))}

      <input
        type="text"
        className="text-input"
        placeholder={searchPlaceholder || "Search…"}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <div className="spacer" />

      <label className="toggle-chip">
        <input type="checkbox" checked={includeTest} onChange={(e) => onIncludeTestChange(e.target.checked)} />
        Include test records
      </label>
    </div>
  );
}
