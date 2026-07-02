"use client";
import { useMemo, useState } from "react";
import type { SalesActivityRow } from "@/lib/types";
import {
  fmtMoney, fmtInt, fmtPct, fmtDate, rangeBounds, inRange, timeSeries, uniqueValues, type Granularity,
} from "@/lib/format";
import { Kpi, Card, Chips, FilterBar, emptyFilters, DataTable, type FilterState, type Column } from "@/components/ui";
import { TimeLineChart, COLORS } from "@/components/charts";

const SELECT_IDS = ["closer", "launch"];

export function SalesTab({ rows }: { rows: SalesActivityRow[] }) {
  const [filters, setFilters] = useState<FilterState>(() => emptyFilters(SELECT_IDS));
  const [gran, setGran] = useState<Granularity>("day");

  const filtered = useMemo(() => {
    const bounds = rangeBounds(filters.range, filters.from, filters.to);
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.range !== "all" && !inRange(r.date, bounds)) return false;
      if (filters.selects.closer && r.closer !== filters.selects.closer) return false;
      if (filters.selects.launch && r.launch !== filters.selects.launch) return false;
      if (q && !(`${r.entry} ${r.closer}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, filters]);

  const t = useMemo(() => {
    const sum = (get: (r: SalesActivityRow) => number) => filtered.reduce((s, r) => s + get(r), 0);
    return {
      newCalls: sum((r) => r.newCalls),
      cancelled: sum((r) => r.cancelled),
      noShow: sum((r) => r.noShow),
      showed: sum((r) => r.showed),
      offers: sum((r) => r.offersMade),
      sales: sum((r) => r.salesMade),
      pif: sum((r) => r.paidInFull),
      plans: sum((r) => r.paymentPlans),
      cash: sum((r) => r.cashCollectedOnCall ?? 0),
      revenue: sum((r) => r.salesInRevenue ?? 0),
    };
  }, [filtered]);

  // Rate definitions mirror the tracker's own Notion formulas:
  // Show % = Showed / New Calls · Offer % = Offers / Showed
  // Close % (Shows) = Sales / Showed · Close % (Offers) = Sales / Offers
  const showPct = t.newCalls > 0 ? t.showed / t.newCalls : null;
  const offerPct = t.showed > 0 ? t.offers / t.showed : null;
  const closeShows = t.showed > 0 ? t.sales / t.showed : null;
  const closeOffers = t.offers > 0 ? t.sales / t.offers : null;

  // Period-scoped leaderboard: recomputed from the daily inputs inside the
  // active date range — solves Notion's all-time-only rollup limitation.
  const leaderboard = useMemo(() => {
    const map = new Map<string, { cash: number; sales: number; showed: number; offers: number; newCalls: number }>();
    for (const r of filtered) {
      const key = r.closer || "(unknown closer)";
      if (!map.has(key)) map.set(key, { cash: 0, sales: 0, showed: 0, offers: 0, newCalls: 0 });
      const e = map.get(key)!;
      e.cash += r.cashCollectedOnCall ?? 0;
      e.sales += r.salesMade;
      e.showed += r.showed;
      e.offers += r.offersMade;
      e.newCalls += r.newCalls;
    }
    return [...map.entries()]
      .map(([name, e]) => ({ name, ...e, closePct: e.showed > 0 ? e.sales / e.showed : null }))
      .sort((a, b) => b.cash - a.cash || b.sales - a.sales);
  }, [filtered]);
  const maxCash = Math.max(1, ...leaderboard.map((l) => l.cash));

  const overTime = useMemo(
    () => timeSeries(filtered, (r) => r.date, gran, [
      { key: "newCalls", get: (r) => r.newCalls },
      { key: "showed", get: (r) => r.showed },
      { key: "offers", get: (r) => r.offersMade },
      { key: "sales", get: (r) => r.salesMade },
    ]),
    [filtered, gran],
  );

  const columns: Column<SalesActivityRow>[] = [
    { key: "date", label: "Date", render: (r) => fmtDate(r.date), sortVal: (r) => r.date ?? "" },
    { key: "closer", label: "Closer", render: (r) => r.closer || "—", sortVal: (r) => r.closer },
    { key: "launch", label: "Launch", render: (r) => r.launch || "—", sortVal: (r) => r.launch },
    { key: "newCalls", label: "New calls", num: true, render: (r) => fmtInt(r.newCalls), sortVal: (r) => r.newCalls },
    { key: "showed", label: "Showed", num: true, render: (r) => fmtInt(r.showed), sortVal: (r) => r.showed },
    { key: "noShow", label: "No show", num: true, render: (r) => fmtInt(r.noShow), sortVal: (r) => r.noShow },
    { key: "offers", label: "Offers", num: true, render: (r) => fmtInt(r.offersMade), sortVal: (r) => r.offersMade },
    { key: "sales", label: "Sales", num: true, render: (r) => fmtInt(r.salesMade), sortVal: (r) => r.salesMade },
    { key: "cash", label: "Cash on call", num: true, render: (r) => fmtMoney(r.cashCollectedOnCall), sortVal: (r) => r.cashCollectedOnCall ?? -1 },
    { key: "rev", label: "Sales revenue", num: true, render: (r) => fmtMoney(r.salesInRevenue), sortVal: (r) => r.salesInRevenue ?? -1 },
  ];

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        searchPlaceholder="Entry or closer"
        selectDefs={[
          { id: "closer", label: "Closer", options: uniqueValues(rows, (r) => r.closer) },
          { id: "launch", label: "Launch", options: uniqueValues(rows, (r) => r.launch) },
        ]}
      />
      <div className="kpi-grid">
        <Kpi label="New calls" value={fmtInt(t.newCalls)} accent={COLORS.blue} />
        <Kpi label="Showed" value={fmtInt(t.showed)} sub={`Show rate ${fmtPct(showPct)}`} />
        <Kpi label="Offers made" value={fmtInt(t.offers)} sub={`Offer rate ${fmtPct(offerPct)}`} />
        <Kpi label="Sales made" value={fmtInt(t.sales)} accent={COLORS.green} sub={`${fmtInt(t.pif)} PIF · ${fmtInt(t.plans)} plans`} />
        <Kpi label="Close % (shows)" value={fmtPct(closeShows)} accent={COLORS.green} />
        <Kpi label="Close % (offers)" value={fmtPct(closeOffers)} />
        <Kpi label="Cash on calls" value={fmtMoney(t.cash)} accent={COLORS.gold} />
        <Kpi label="Sales revenue" value={fmtMoney(t.revenue)} sub="Full value once paid in full" />
      </div>

      <Card title="Leaderboard" sub="Ranked by cash collected on call, within the active filters — pick a date range for weekly or monthly standings">
        {leaderboard.length === 0 ? <div className="empty">No entries in this range.</div> : leaderboard.map((l, i) => (
          <div className="lb-row" key={l.name}>
            <div className={`lb-rank ${i < 3 ? "top" : ""}`}>{i + 1}</div>
            <div className="lb-name">{l.name}</div>
            <div className="lb-bar-track"><div className="lb-bar" style={{ width: `${(l.cash / maxCash) * 100}%` }} /></div>
            <div className="lb-stat">{fmtInt(l.showed)} shows</div>
            <div className="lb-stat">{fmtInt(l.sales)} sales</div>
            <div className="lb-stat">{fmtPct(l.closePct)}</div>
            <div className="lb-cash">{fmtMoney(l.cash)}</div>
          </div>
        ))}
      </Card>

      <Card
        title="Activity trend"
        sub="Daily inputs summed per period"
        right={<Chips options={[{ key: "day", label: "Daily" }, { key: "week", label: "Weekly" }, { key: "month", label: "Monthly" }]} active={gran} onChange={(k) => setGran(k as Granularity)} />}
      >
        <TimeLineChart data={overTime} series={[
          { key: "newCalls", name: "New calls", color: COLORS.blue },
          { key: "showed", name: "Showed", color: COLORS.gold },
          { key: "offers", name: "Offers", color: COLORS.purple },
          { key: "sales", name: "Sales", color: COLORS.green },
        ]} />
      </Card>

      <Card title="Daily entries" sub="One row per closer per day, straight from the tracker">
        <DataTable rows={filtered} columns={columns} initialSort={{ key: "date", dir: "desc" }} />
      </Card>
    </>
  );
}
