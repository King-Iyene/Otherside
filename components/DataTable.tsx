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
  /** When true, renders a search box above the table. Filters rows by
   *  stringifying every column's sortValue (or falling back to render output
   *  via the row itself if the object is stringifiable). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Optional custom accessor — overrides the default row-stringification. */
  searchAccessor?: (row: T) => string;
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  isTestRow,
  cap = 200,
  searchable = false,
  searchPlaceholder = "Search…",
  searchAccessor,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  // Build a lowercased searchable string for each row. If the caller gave us
  // an accessor use that; otherwise concatenate every column's sortValue.
  function searchTextFor(row: T): string {
    if (searchAccessor) return searchAccessor(row).toLowerCase();
    const parts: string[] = [];
    for (const c of columns) {
      if (c.sortValue) {
        const v = c.sortValue(row);
        if (v !== null && v !== undefined) parts.push(String(v));
      }
    }
    // Also stringify the row itself in case sortValue isn't defined for a column.
    for (const key of Object.keys(row as any)) {
      const v = (row as any)[key];
      if (v !== null && v !== undefined && (typeof v === "string" || typeof v === "number")) parts.push(String(v));
    }
    return parts.join(" ").toLowerCase();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => searchTextFor(r).includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.sortValue) return filtered;
    const withVals = filtered.map((r) => ({ r, v: col.sortValue!(r) }));
    withVals.sort((a, b) => {
      if (a.v === null && b.v === null) return 0;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      if (a.v < b.v) return -1 * sortDir;
      if (a.v > b.v) return 1 * sortDir;
      return 0;
    });
    return withVals.map((x) => x.r);
  }, [filtered, sortKey, sortDir, columns]);

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
    <div>
      {searchable && (
        <input
          type="text"
          className="text-input"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", marginBottom: 10 }}
          autoFocus
        />
      )}
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
                  {search ? "No rows match your search." : "No rows match the current filters."}
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
            Showing {visible.length} of {sorted.length}{search && rows.length !== sorted.length ? ` (of ${rows.length})` : ""} rows
          </span>
          {sorted.length > cap && (
            <button className="link-btn" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show less" : `Show all ${sorted.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
