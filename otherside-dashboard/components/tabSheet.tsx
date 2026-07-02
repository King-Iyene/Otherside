"use client";
import { useMemo, useState } from "react";
import type { SheetData } from "@/lib/types";
import { fmtMoney, fmtInt } from "@/lib/format";
import { Kpi, Card } from "@/components/ui";
import { BreakdownBars, COLORS } from "@/components/charts";

// Generic Google Sheet view. It auto-detects which columns look like money
// or numbers and totals them, and lets you group any numeric column by any
// text column — so it keeps working when the sheet's structure changes.

function parseNum(s: string): number | null {
  const cleaned = (s ?? "").replace(/[$€£₦,\s%]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function SheetTab({ sheet }: { sheet: SheetData }) {
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  const numericCols = useMemo(() => {
    if (!sheet.ok) return [];
    return sheet.headers.filter((h) => {
      const vals = sheet.rows.map((r) => r[h]).filter((v) => v && v.trim() !== "");
      if (vals.length === 0) return false;
      const parseable = vals.filter((v) => parseNum(v) !== null).length;
      return parseable / vals.length >= 0.7; // 70%+ of non-empty values are numeric
    });
  }, [sheet]);

  const textCols = useMemo(
    () => (sheet.ok ? sheet.headers.filter((h) => !numericCols.includes(h)) : []),
    [sheet, numericCols],
  );

  // Low-cardinality text columns get dropdown filters automatically.
  const filterCols = useMemo(() => {
    return textCols
      .map((h) => ({ h, values: [...new Set(sheet.rows.map((r) => r[h]).filter(Boolean))].sort() }))
      .filter((c) => c.values.length >= 2 && c.values.length <= 25);
  }, [textCols, sheet.rows]);

  const filtered = useMemo(() => {
    if (!sheet.ok) return [];
    const q = search.trim().toLowerCase();
    return sheet.rows.filter((r) => {
      for (const [col, val] of Object.entries(colFilters)) {
        if (val && r[col] !== val) return false;
      }
      if (q && !Object.values(r).some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [sheet, search, colFilters]);

  const [groupBy, setGroupBy] = useState("");
  const [metric, setMetric] = useState("");
  const activeMetric = metric || numericCols[0] || "";
  const grouped = useMemo(() => {
    if (!groupBy || !activeMetric) return [];
    const map = new Map<string, number>();
    for (const r of filtered) {
      const k = r[groupBy] || "(blank)";
      map.set(k, (map.get(k) ?? 0) + (parseNum(r[activeMetric]) ?? 0));
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 15);
  }, [filtered, groupBy, activeMetric]);

  if (!sheet.ok) {
    return (
      <div className="alert warn">
        <strong>Challenge sheet not connected yet.</strong><br />{sheet.error}
      </div>
    );
  }
  if (sheet.rows.length === 0) {
    return <div className="empty">The sheet loaded but has no data rows.</div>;
  }

  const moneyLike = (h: string) => sheet.rows.some((r) => (r[h] ?? "").includes("$"));

  return (
    <>
      <div className="filter-bar">
        {filterCols.slice(0, 4).map((c) => (
          <div className="filter-group" key={c.h}>
            <span className="filter-label">{c.h}</span>
            <select value={colFilters[c.h] ?? ""} onChange={(e) => setColFilters({ ...colFilters, [c.h]: e.target.value })}>
              <option value="">All</option>
              {c.values.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        ))}
        <div className="filter-group">
          <span className="filter-label">Search</span>
          <input type="text" placeholder="Any column" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi label="Rows" value={fmtInt(filtered.length)} />
        {numericCols.slice(0, 4).map((h) => {
          const total = filtered.reduce((s, r) => s + (parseNum(r[h]) ?? 0), 0);
          return <Kpi key={h} label={`Total ${h}`} value={moneyLike(h) ? fmtMoney(total) : fmtInt(total)} accent={COLORS.gold} />;
        })}
      </div>

      {numericCols.length > 0 && textCols.length > 0 && (
        <Card
          title="Group & compare"
          sub="Pick any text column and any numeric column from the sheet"
          right={
            <div style={{ display: "flex", gap: 8 }}>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}>
                <option value="">Group by…</option>
                {textCols.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <select value={activeMetric} onChange={(e) => setMetric(e.target.value)} style={{ background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}>
                {numericCols.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          }
        >
          {groupBy ? (
            <BreakdownBars data={grouped} isMoney={moneyLike(activeMetric)} horizontal />
          ) : (
            <div className="empty">Choose a "Group by" column above to draw this chart.</div>
          )}
        </Card>
      )}

      <Card title="Sheet data" sub={`${sheet.headers.length} columns, live from Google Sheets`}>
        <div className="table-wrap">
          <table className="data">
            <thead><tr>{sheet.headers.map((h) => <th key={h} className={numericCols.includes(h) ? "num" : ""}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.slice(0, 300).map((r, i) => (
                <tr key={i}>
                  {sheet.headers.map((h) => <td key={h} className={numericCols.includes(h) ? "num" : ""}>{r[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 300 && <div className="empty">Showing first 300 of {filtered.length} rows — use search or filters to narrow down.</div>}
        </div>
      </Card>
    </>
  );
}
