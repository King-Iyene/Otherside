"use client";

import { useMemo, useState } from "react";
import type { ChallengeRow } from "@/lib/types";
import { resolveRange, inRange, type RangePreset } from "@/lib/dates";
import { uniqueSorted, sum } from "@/lib/filtering";
import { previousPeriod, computeDelta } from "@/lib/comparison";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import Controls from "../Controls";
import KpiGrid from "../Kpi";
import TimeSeriesChart from "../TimeSeriesChart";
import BreakdownChart from "../BreakdownChart";
import InfoTip from "../InfoTip";
import { detectChallengeColumns, parseAmount } from "@/lib/challengeColumns";

function valStr(v: any): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

const valNum = parseAmount;

export default function ChallengeTab({ rows, columns }: { rows: ChallengeRow[]; columns: string[] }) {
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [search, setSearch] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [challengeFilter, setChallengeFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [couponFilter, setCouponFilter] = useState("");
  const [utmFilter, setUtmFilter] = useState("");

  // Detect column roles by CONTENT + header hint, not header name alone — so the
  // money/date columns are found even when they aren't literally called "amount"
  // or "date". Uses all rows (pre-filter) so detection is stable.
  const detected = useMemo(() => detectChallengeColumns(columns, rows), [columns, rows]);
  const dateCol = detected.date;
  const amountCol = detected.amount;
  const productCol = detected.product;
  const couponCol = detected.coupon;
  const challengeCol = detected.challenge;
  const utmCol = detected.utm;

  const challenges = useMemo(() => (challengeCol ? uniqueSorted(rows.map((r) => valStr(r[challengeCol]))) : []), [challengeCol, rows]);
  const products = useMemo(() => (productCol ? uniqueSorted(rows.map((r) => valStr(r[productCol]))) : []), [productCol, rows]);
  const coupons = useMemo(
    () => (couponCol ? uniqueSorted(rows.map((r) => valStr(r[couponCol])).filter(Boolean)) : []),
    [couponCol, rows]
  );
  const utms = useMemo(() => (utmCol ? uniqueSorted(rows.map((r) => valStr(r[utmCol])).filter(Boolean)) : []), [utmCol, rows]);

  const { from, to } = resolveRange(preset, customFrom, customTo);

  const dimensionMatch = (r: ChallengeRow) => {
    if (challengeCol && challengeFilter && valStr(r[challengeCol]) !== challengeFilter) return false;
    if (productCol && productFilter && valStr(r[productCol]) !== productFilter) return false;
    if (couponCol && couponFilter) {
      const cv = valStr(r[couponCol]);
      if (couponFilter === "__NONE__" ? cv !== "" : cv !== couponFilter) return false;
    }
    if (utmCol && utmFilter && valStr(r[utmCol]) !== utmFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!columns.some((c) => valStr(r[c]).toLowerCase().includes(q))) return false;
    }
    return true;
  };

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!includeTest && r.isTest) return false;
        if (dateCol && !inRange(valStr(r[dateCol]) || null, from, to)) return false;
        return dimensionMatch(r);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, from, to, includeTest, dateCol, challengeFilter, productFilter, couponFilter, utmFilter, search]
  );

  const prevRange = previousPeriod(from, to);
  const prevFiltered = useMemo(() => {
    if (!prevRange || !dateCol) return null;
    return rows.filter((r) => {
      if (!includeTest && r.isTest) return false;
      if (!inRange(valStr(r[dateCol]) || null, prevRange.from, prevRange.to)) return false;
      return dimensionMatch(r);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prevRange, includeTest, dateCol, challengeFilter, productFilter, couponFilter, utmFilter, search]);

  const revenue = amountCol ? sum(filtered.map((r) => valNum(r[amountCol]))) : 0;
  const registrations = filtered.length;
  const paidRegs = amountCol ? filtered.filter((r) => (valNum(r[amountCol]) ?? 0) > 0).length : 0;
  const freeRegs = registrations - paidRegs;
  const couponUsed = couponCol ? filtered.filter((r) => valStr(r[couponCol]) !== "").length : 0;
  const avgTicket = paidRegs > 0 ? revenue / paidRegs : null;
  const paidRate = registrations > 0 ? paidRegs / registrations : null;
  const couponRate = registrations > 0 ? couponUsed / registrations : null;

  const prevRevenue = prevFiltered && amountCol ? sum(prevFiltered.map((r) => valNum(r[amountCol]))) : null;
  const prevRegs = prevFiltered ? prevFiltered.length : null;
  const prevPaid = prevFiltered && amountCol ? prevFiltered.filter((r) => (valNum(r[amountCol]) ?? 0) > 0).length : null;
  const prevCouponUsed = prevFiltered && couponCol ? prevFiltered.filter((r) => valStr(r[couponCol]) !== "").length : null;

  const priceMix = useMemo(() => {
    if (!amountCol) return [];
    const buckets = new Map<string, number>();
    for (const r of filtered) {
      const n = valNum(r[amountCol]);
      const key = n === null || n === 0 ? "$0 (free/coupon)" : `$${n}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return Array.from(buckets.entries())
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, amountCol]);

  const productMix = useMemo(() => {
    if (!productCol) return [];
    return uniqueSorted(filtered.map((r) => valStr(r[productCol])))
      .map((p) => ({
        product: p,
        registrations: filtered.filter((r) => valStr(r[productCol]) === p).length,
        revenue: amountCol ? sum(filtered.filter((r) => valStr(r[productCol]) === p).map((r) => valNum(r[amountCol]))) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered, productCol, amountCol]);

  const couponMix = useMemo(() => {
    if (!couponCol) return [];
    const map = new Map<string, { count: number; revenue: number; freeCount: number }>();
    for (const r of filtered) {
      const raw = valStr(r[couponCol]);
      const key = raw || "(no coupon)";
      const existing = map.get(key) || { count: 0, revenue: 0, freeCount: 0 };
      existing.count += 1;
      const amt = amountCol ? valNum(r[amountCol]) : null;
      existing.revenue += amt ?? 0;
      if ((amt ?? 0) === 0) existing.freeCount += 1;
      map.set(key, existing);
    }
    return Array.from(map.entries())
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [filtered, couponCol, amountCol]);

  const utmMix = useMemo(() => {
    if (!utmCol) return [];
    const map = new Map<string, { count: number; revenue: number }>();
    for (const r of filtered) {
      const raw = valStr(r[utmCol]) || "(direct/none)";
      const existing = map.get(raw) || { count: 0, revenue: 0 };
      existing.count += 1;
      if (amountCol) existing.revenue += valNum(r[amountCol]) ?? 0;
      map.set(raw, existing);
    }
    return Array.from(map.entries())
      .map(([channel, v]) => ({ channel, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [filtered, utmCol, amountCol]);

  const dimensions = [
    challengeCol
      ? { key: "challenge", label: challengeCol, options: challenges, value: challengeFilter, onChange: setChallengeFilter }
      : null,
    productCol ? { key: "product", label: productCol, options: products, value: productFilter, onChange: setProductFilter } : null,
    couponCol
      ? {
          key: "coupon",
          label: couponCol,
          options: ["__NONE__", ...coupons],
          value: couponFilter,
          onChange: setCouponFilter,
        }
      : null,
    utmCol ? { key: "utm", label: utmCol, options: utms, value: utmFilter, onChange: setUtmFilter } : null,
  ].filter(Boolean) as any[];

  if (columns.length === 0) {
    return (
      <div className="empty-state">
        No columns detected in the Challenge sheet. Confirm CHALLENGE_SHEET_ID and CHALLENGE_SHEET_GID are set and the sheet is
        publicly viewable.
      </div>
    );
  }

  return (
    <div>
      <Controls
        preset={preset}
        onPresetChange={setPreset}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        dimensions={dimensions}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search email, name, coupon…"
        includeTest={includeTest}
        onIncludeTestChange={setIncludeTest}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          fontSize: 11,
          color: "var(--muted)",
          margin: "2px 2px 12px",
        }}
      >
        <span style={{ textTransform: "uppercase", letterSpacing: 0.08, fontWeight: 600 }}>Detected columns</span>
        {(
          [
            ["Money", amountCol],
            ["Date", dateCol],
            ["Product", productCol],
            ["Coupon", couponCol],
            ["Challenge", challengeCol],
          ] as const
        ).map(([role, col]) => (
          <span key={role} style={{ display: "inline-flex", gap: 4 }}>
            {role}:{" "}
            <span style={{ color: col ? "var(--accent)" : "var(--red)", fontFamily: "var(--font-mono)" }}>{col || "not found"}</span>
          </span>
        ))}
        <InfoTip
          text={
            "The dashboard figures out which sheet column holds the money, the date, etc. by looking at what's actually in each column — so it works even if your headers aren't named exactly \"Amount\" or \"Date\". If any of these picked the wrong column, tell me the exact header name from your sheet and I'll lock it in."
          }
        />
      </div>

      <KpiGrid
        items={[
          { label: "Revenue", value: formatMoney(revenue), delta: prevRevenue !== null ? computeDelta(revenue, prevRevenue) : null },
          {
            label: "Registrations",
            value: formatNumber(registrations),
            delta: prevRegs !== null ? computeDelta(registrations, prevRegs) : null,
          },
          {
            label: "Paid Registrations",
            value: formatNumber(paidRegs),
            delta: prevPaid !== null ? computeDelta(paidRegs, prevPaid) : null,
          },
          {
            label: "Free / Coupon Regs",
            value: formatNumber(freeRegs),
          },
          {
            label: "Paid %",
            value: formatPercent(paidRate),
          },
          { label: "Avg Ticket (paid)", value: formatMoney(avgTicket) },
          {
            label: "Coupon Uses",
            value: formatNumber(couponUsed),
            delta: prevCouponUsed !== null ? computeDelta(couponUsed, prevCouponUsed) : null,
          },
          { label: "Coupon Rate", value: formatPercent(couponRate) },
        ]}
      />

      <div className="chart-grid">
        {dateCol && amountCol ? (
          <TimeSeriesChart
            title="Revenue Over Time"
            points={filtered.map((r) => ({ date: valStr(r[dateCol]) || null, value: valNum(r[amountCol]) ?? 0 }))}
            color="#f2b63c"
            valueFormatter={(v) => formatMoney(v)}
          />
        ) : (
          <div className="panel">
            <div className="panel-title">Revenue Over Time</div>
            <div className="empty-state">Date or Amount column not detected in sheet.</div>
          </div>
        )}
        <BreakdownChart title="Price Tier Distribution" items={priceMix.slice(0, 10)} />
      </div>

      <div className="chart-grid">
        {productCol && (
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Product Performance</div>
            </div>
            {productMix.length === 0 ? (
              <div className="empty-state">No product data.</div>
            ) : (
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Registrations</th>
                    <th>Revenue</th>
                    <th>Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {productMix.map((p) => (
                    <tr key={p.product}>
                      <td>{p.product || "(unspecified)"}</td>
                      <td className="mono">{formatNumber(p.registrations)}</td>
                      <td className="mono">{formatMoney(p.revenue)}</td>
                      <td className="mono">{p.registrations ? formatMoney(p.revenue / p.registrations) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {utmCol && (
          <BreakdownChart title="Registrations by UTM Medium" items={utmMix.map((u) => ({ key: u.channel, value: u.count }))} />
        )}
      </div>

      {couponCol && couponMix.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-title">Coupon Utilization</div>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Code</th>
                <th>Uses</th>
                <th>% of Total</th>
                <th>Free Registrations</th>
                <th>Revenue Generated</th>
              </tr>
            </thead>
            <tbody>
              {couponMix.map((c) => (
                <tr key={c.code}>
                  <td className="mono">{c.code}</td>
                  <td className="mono">{formatNumber(c.count)}</td>
                  <td className="mono">{formatPercent(registrations ? c.count / registrations : null)}</td>
                  <td className="mono">{formatNumber(c.freeCount)}</td>
                  <td className="mono">{formatMoney(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {utmCol && utmMix.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-title">UTM Channel Performance</div>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Registrations</th>
                <th>Revenue</th>
                <th>Rev / Reg</th>
              </tr>
            </thead>
            <tbody>
              {utmMix.map((u) => (
                <tr key={u.channel}>
                  <td>{u.channel}</td>
                  <td className="mono">{formatNumber(u.count)}</td>
                  <td className="mono">{formatMoney(u.revenue)}</td>
                  <td className="mono">{u.count ? formatMoney(u.revenue / u.count) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {challengeCol && challenges.length > 1 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-header">
            <div className="panel-title">Challenge Comparison</div>
          </div>
          <table className="leaderboard">
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Registrations</th>
                <th>Paid</th>
                <th>Paid %</th>
                <th>Revenue</th>
                <th>Avg Ticket (paid)</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((c) => {
                const rowsForCh = filtered.filter((r) => valStr(r[challengeCol]) === c);
                const paid = amountCol ? rowsForCh.filter((r) => (valNum(r[amountCol]) ?? 0) > 0).length : 0;
                const rev = amountCol ? sum(rowsForCh.map((r) => valNum(r[amountCol]))) : 0;
                return (
                  <tr key={c}>
                    <td>{c || "(unspecified)"}</td>
                    <td className="mono">{formatNumber(rowsForCh.length)}</td>
                    <td className="mono">{formatNumber(paid)}</td>
                    <td className="mono">{formatPercent(rowsForCh.length ? paid / rowsForCh.length : null)}</td>
                    <td className="mono">{formatMoney(rev)}</td>
                    <td className="mono">{paid ? formatMoney(rev / paid) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ color: "var(--muted)", fontSize: 11, textAlign: "center", padding: 10 }}>
        Showing aggregates across {formatNumber(filtered.length)} filtered registration
        {filtered.length === 1 ? "" : "s"}. The raw lead list lives in the Google Sheet — this view is for
        analysis, not lookup.
      </div>
    </div>
  );
}
