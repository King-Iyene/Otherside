"use client";

import type { RangePreset } from "@/lib/dates";
import type { CompareMode } from "@/lib/comparison";
import InfoTip from "./InfoTip";
import MultiSelect from "./MultiSelect";

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
  /** Selected values; empty array = All. Multi-select. */
  value: string[];
  onChange: (v: string[]) => void;
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
  compareMode?: CompareMode;
  onCompareModeChange?: (m: CompareMode) => void;
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
  compareMode,
  onCompareModeChange,
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
        <MultiSelect key={d.key} label={d.label} options={d.options} value={d.value} onChange={d.onChange} />
      ))}

      <input
        type="text"
        className="text-input"
        placeholder={searchPlaceholder || "Search…"}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <div className="spacer" />

      {onCompareModeChange && compareMode !== undefined && (
        <div className="control-group" style={{ alignItems: "center" }}>
          <button className={`preset-btn ${compareMode === "prev" ? "active" : ""}`} onClick={() => onCompareModeChange("prev")}>
            vs Prev
          </button>
          <button className={`preset-btn ${compareMode === "yoy" ? "active" : ""}`} onClick={() => onCompareModeChange("yoy")}>
            vs YoY
          </button>
          <InfoTip
            text={
              "The little green ▲ or red ▼ under each number tells you if it went up or down — and by how much — compared to an earlier time. Pick what to compare against:\n\n" +
              "• vs Prev — compares to the period just before. If you're looking at the last 30 days, it compares to the 30 days before that.\n\n" +
              "• vs YoY — compares to the same dates one year ago (\"year over year\").\n\n" +
              "Green means it moved in a good direction, red means bad. If it says \"n/a\", there was nothing to compare against — for example, one year ago the business hadn't started yet."
            }
          />
        </div>
      )}

      <label className="toggle-chip">
        <input type="checkbox" checked={includeTest} onChange={(e) => onIncludeTestChange(e.target.checked)} />
        Include test records
      </label>
    </div>
  );
}
