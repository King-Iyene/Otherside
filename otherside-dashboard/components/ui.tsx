"use client";
import { useState, useMemo, type ReactNode } from "react";
import { RANGE_OPTIONS, type RangePreset } from "@/lib/format";

export function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="kpi" style={accent ? ({ ["--kpi-accent" as any]: accent }) : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

export function Card({ title, sub, right, children }: { title: string; sub?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {sub ? <div className="card-sub">{sub}</div> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Chips({ options, active, onChange }: { options: { key: string; label: string }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.key} className={`chip ${active === o.key ? "on" : ""}`} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Filter bar ----------
export interface SelectFilter {
  id: string;
  label: string;
  options: string[];
}

export interface FilterState {
  range: RangePreset;
  from: string;
  to: string;
  search: string;
  selects: Record<string, string>; // filter id -> selected value ("" = all)
}

export function emptyFilters(selectIds: string[]): FilterState {
  const selects: Record<string, string> = {};
  selectIds.forEach((id) => (selects[id] = ""));
  return { range: "all", from: "", to: "", search: "", selects };
}

export function FilterBar({
  filters, setFilters, selectDefs, searchPlaceholder, extra,
}: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  selectDefs: SelectFilter[];
  searchPlaceholder?: string;
  extra?: ReactNode;
}) {
  const isDefault =
    filters.range === "all" && !filters.search &&
    Object.values(filters.selects).every((v) => v === "");
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">Date range</span>
        <select value={filters.range} onChange={(e) => setFilters({ ...filters, range: e.target.value as RangePreset })}>
          {RANGE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      {filters.range === "custom" && (
        <>
          <div className="filter-group">
            <span className="filter-label">From</span>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </div>
          <div className="filter-group">
            <span className="filter-label">To</span>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </div>
        </>
      )}
      {selectDefs.map((def) => (
        <div className="filter-group" key={def.id}>
          <span className="filter-label">{def.label}</span>
          <select
            value={filters.selects[def.id] ?? ""}
            onChange={(e) => setFilters({ ...filters, selects: { ...filters.selects, [def.id]: e.target.value } })}
          >
            <option value="">All</option>
            {def.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      ))}
      <div className="filter-group">
        <span className="filter-label">Search</span>
        <input
          type="text"
          placeholder={searchPlaceholder ?? "Name or email"}
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
      </div>
      {!isDefault && (
        <button className="reset-link" onClick={() => setFilters(emptyFilters(Object.keys(filters.selects)))}>
          Reset filters
        </button>
      )}
      {extra}
    </div>
  );
}

// ---------- Sortable table ----------
export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  render: (row: T) => ReactNode;
  sortVal: (row: T) => string | number;
}

export function DataTable<T extends { id: string; isTest?: boolean }>({
  rows, columns, initialSort, maxRows = 200,
}: {
  rows: T[]; columns: Column<T>[]; initialSort?: { key: string; dir: "asc" | "desc" }; maxRows?: number;
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, dir: "desc" as "asc" | "desc" });
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort.key) ?? columns[0];
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = col.sortVal(a);
      const vb = col.sortVal(b);
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, columns]);

  const visible = showAll ? sorted : sorted.slice(0, maxRows);

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={c.num ? "num" : ""}
                onClick={() => setSort({ key: c.key, dir: sort.key === c.key && sort.dir === "desc" ? "asc" : "desc" })}
              >
                {c.label}{sort.key === c.key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.id} className={r.isTest ? "row-test" : ""}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? "num" : ""}>{c.render(r)}</td>
              ))}
            </tr>
          ))}
          {visible.length === 0 && (
            <tr><td colSpan={columns.length}><div className="empty">No rows match the current filters.</div></td></tr>
          )}
        </tbody>
      </table>
      {sorted.length > maxRows && !showAll && (
        <div style={{ textAlign: "center", padding: 10 }}>
          <button className="reset-link" onClick={() => setShowAll(true)}>
            Show all {sorted.length.toLocaleString()} rows
          </button>
        </div>
      )}
    </div>
  );
}
