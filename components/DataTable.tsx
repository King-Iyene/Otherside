"use client";

import { useMemo, useState, ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  isTestRow?: (row: T) => boolean;
  cap?: number;
}

export default function DataTable<T>({ columns, rows, rowKey, isTestRow, cap = 200 }: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return rows;
    const withVals = rows.map((r) => ({ r, v: col.sortValue!(r) }));
    withVals.sort((a, b) => {
      if (a.v === null && b.v === null) return 0;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      if (a.v < b.v) return -1 * sortDir;
      if (a.v > b.v) return 1 * sortDir;
      return 0;
    });
    return withVals.map((x) => x.r);
  }, [rows, sortKey, sortDir, columns]);

  const visible = showAll ? sorted : sorted.slice(0, cap);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} onClick={() => c.sortValue && toggleSort(c.key)}>
                {c.label}
                {sortKey === c.key ? (sortDir === 1 ? " ▲" : " ▼") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty-state">
                No rows match the current filters.
              </td>
            </tr>
          ) : (
            visible.map((row) => (
              <tr key={rowKey(row)} className={isTestRow?.(row) ? "test-row" : ""}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render(row)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="table-footer">
        <span>
          Showing {visible.length} of {sorted.length} rows
        </span>
        {sorted.length > cap && (
          <button className="link-btn" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Show less" : `Show all ${sorted.length}`}
          </button>
        )}
      </div>
    </div>
  );
}
