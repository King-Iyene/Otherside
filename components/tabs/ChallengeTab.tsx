"use client";

import { useMemo, useState } from "react";
import type { ChallengeRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, sum } from "@/lib/filtering";
import { MONEY_HEADER_PATTERN, DATE_HEADER_PATTERN } from "@/lib/sources/challenge";
import { formatMoney, formatNumber } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import DataTable, { type Column } from "../DataTable";
import { InvalidBadge } from "../HealthBadge";

export default function ChallengeTab({ rows, columns }: { rows: ChallengeRow[]; columns: string[] }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [dimensionValue, setDimensionValue] = useState("");

  const moneyColumns = useMemo(() => columns.filter((c) => MONEY_HEADER_PATTERN.test(c)), [columns]);
  const dateColumns = useMemo(() => columns.filter((c) => DATE_HEADER_PATTERN.test(c)), [columns]);
  const primaryDateCol = dateColumns[0];
  const primaryMoneyCol = moneyColumns[0];

  const textColumns = useMemo(
    () => columns.filter((c) => !moneyColumns.includes(c) && !dateColumns.includes(c)),
    [columns, moneyColumns, dateColumns]
  );
  const dimensionCol = textColumns[0];
  const dimensionOptions = useMemo(
    () => (dimensionCol ? uniqueSorted(rows.map((r) => r[dimensionCol])) : []),
    [rows, dimensionCol]
  );

  const filtered = useMemo(() => {
    const { from, to } = resolveRange(preset, customFrom, customTo);
    return rows.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (primaryDateCol && !inRange(r[primaryDateCol], from, to)) return false;
      if (dimensionCol && dimensionValue && r[dimensionCol] !== dimensionValue) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const found = columns.some((c) => String(r[c] ?? "").toLowerCase().includes(q));
        if (!found) return false;
      }
      return true;
    });
  }, [rows, preset, customFrom, customTo, primaryDateCol, dimensionCol, dimensionValue, search, includeTest, columns]);

  if (columns.length === 0) {
    return <div className="empty-state">No columns detected in the Challenge sheet.</div>;
  }

  const tableColumns: Column<ChallengeRow>[] = columns.map((c) => ({
    key: c,
    label: c,
    render: (r) => {
      const flag = r.health.find((f) => f.field === c);
      if (flag && flag.kind === "unparseable_money") return <InvalidBadge raw={flag.raw} />;
      if (flag && flag.kind === "missing_date") return <span className="badge muted">MISSING</span>;
      const v = r[c];
      if (moneyColumns.includes(c)) return typeof v === "number" ? <span className="mono">{formatMoney(v)}</span> : "—";
      return v === null || v === undefined || v === "" ? "—" : String(v);
    },
    sortValue: (r) => (r[c] === null || r[c] === undefined ? null : (r[c] as string | number)),
  }));

  return (
    <div>
      <Controls
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        dimensions={
          dimensionCol
            ? [{ key: dimensionCol, label: dimensionCol, options: dimensionOptions, value: dimensionValue, onChange: setDimensionValue }]
            : []
        }
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search all columns…"
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
      />

      <KpiGrid
        items={[
          { label: "Rows", value: formatNumber(filtered.length) },
          ...moneyColumns.slice(0, 3).map((c) => ({
            label: c,
            value: formatMoney(sum(filtered.map((r) => (typeof r[c] === "number" ? (r[c] as number) : null)))),
          })),
        ]}
      />

      {primaryDateCol && primaryMoneyCol && (
        <div className="chart-grid">
          <TimeSeriesChart
            title={`${primaryMoneyCol} Over Time`}
            points={filtered.map((r) => ({ date: r[primaryDateCol], value: typeof r[primaryMoneyCol] === "number" ? r[primaryMoneyCol] : 0 }))}
            color="#f2b63c"
            valueFormatter={(v) => formatMoney(v)}
          />
          {dimensionCol && (
            <BreakdownChart
              title={`${primaryMoneyCol} by ${dimensionCol}`}
              items={dimensionOptions.map((opt) => ({
                key: opt,
                value: sum(filtered.filter((r) => r[dimensionCol] === opt).map((r) => (typeof r[primaryMoneyCol] === "number" ? r[primaryMoneyCol] : null))),
              }))}
              valueFormatter={(v) => formatMoney(v)}
            />
          )}
        </div>
      )}

      <DataTable columns={tableColumns} rows={filtered} rowKey={(r) => r.id} isTestRow={(r) => r.isTest} />
    </div>
  );
}
