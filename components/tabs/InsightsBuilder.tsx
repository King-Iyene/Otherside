"use client";

import { useMemo, useState } from "react";
import type { ApplicationRow, AppointmentRow, CashRow, ChallengeRow, SalesActivityRow } from "@/lib/types";
import {
  applyFilters,
  buildDatasets,
  computeGroup,
  getRowsForDataset,
  optionsFor,
  type CrossJoin,
  type DataBundle,
  type DatasetDef,
  type DatasetKey,
  type FilterRule,
  type QueryGroup,
} from "@/lib/insightsQuery";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import DrillDownModal from "../DrillDownModal";

interface Props {
  cash: CashRow[];
  appointments: AppointmentRow[];
  applications: ApplicationRow[];
  salesActivity: SalesActivityRow[];
  challenge: ChallengeRow[];
  challengeColumns: string[];
}

const OP_LABELS: Record<string, string> = {
  eq: "equals",
  neq: "does not equal",
  in: "is any of",
  notIn: "is not any of",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  contains: "contains",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

const OPS_FOR_TYPE: Record<string, string[]> = {
  select: ["eq", "neq", "in", "notIn", "isEmpty", "isNotEmpty"],
  text: ["eq", "neq", "contains", "isEmpty", "isNotEmpty"],
  number: ["gt", "gte", "lt", "lte", "eq", "neq", "isEmpty", "isNotEmpty"],
  date: ["gt", "gte", "lt", "lte", "isEmpty", "isNotEmpty"],
  boolean: ["eq"],
};

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function makeEmptyGroup(datasetKey: DatasetKey, label: string, color: string): QueryGroup {
  return { id: genId(), datasetKey, label, filters: [], color };
}

export default function InsightsBuilder({
  cash,
  appointments,
  applications,
  salesActivity,
  challenge,
  challengeColumns,
}: Props) {
  const datasets = useMemo(() => buildDatasets(challenge, challengeColumns), [challenge, challengeColumns]);
  const bundle: DataBundle = { cash, appointments, applications, sales: salesActivity, challenge };

  const [includeTest, setIncludeTest] = useState(false);
  const [groups, setGroups] = useState<QueryGroup[]>([
    makeEmptyGroup("applications", "Group A", "var(--accent)"),
    makeEmptyGroup("applications", "Group B", "var(--blue)"),
  ]);
  const [crossEnabled, setCrossEnabled] = useState(true);
  const [cross, setCross] = useState<CrossJoin>({ crossWith: "cash", crossFilters: [] });
  const [displayMode, setDisplayMode] = useState<"count" | "percent">("percent");
  const [drilldown, setDrilldown] = useState<{ title: string; rows: any[]; group: QueryGroup } | null>(null);

  const results = useMemo(
    () => groups.map((g) => computeGroup(g, datasets, bundle, crossEnabled ? cross : null, includeTest)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, datasets, cross, crossEnabled, includeTest, cash, appointments, applications, salesActivity, challenge]
  );

  function updateGroup(id: string, patch: Partial<QueryGroup>) {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function addFilter(groupId: string) {
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== groupId) return g;
        const dataset = datasets.find((d) => d.key === g.datasetKey);
        const firstField = dataset?.fields[0];
        if (!firstField) return g;
        const newRule: FilterRule = { fieldKey: firstField.key, op: OPS_FOR_TYPE[firstField.type][0] as any };
        return { ...g, filters: [...g.filters, newRule] };
      })
    );
  }

  function updateFilter(groupId: string, idx: number, patch: Partial<FilterRule>) {
    setGroups((gs) =>
      gs.map((g) => (g.id === groupId ? { ...g, filters: g.filters.map((f, i) => (i === idx ? { ...f, ...patch } : f)) } : g))
    );
  }

  function removeFilter(groupId: string, idx: number) {
    setGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, filters: g.filters.filter((_, i) => i !== idx) } : g)));
  }

  function addGroup() {
    if (groups.length >= 4) return;
    const palette = ["var(--accent)", "var(--blue)", "var(--green)", "var(--purple)"];
    setGroups((gs) => [
      ...gs,
      makeEmptyGroup("applications", `Group ${String.fromCharCode(65 + gs.length)}`, palette[gs.length] || "var(--accent)"),
    ]);
  }

  function removeGroup(id: string) {
    setGroups((gs) => (gs.length <= 1 ? gs : gs.filter((g) => g.id !== id)));
  }

  const totalBase = results.reduce((s, r) => s + r.baseCount, 0);

  return (
    <div>
      {/* Header */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(242,182,60,0.08), rgba(97,170,242,0.05))",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: "18px 20px",
          marginBottom: 20,
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>Insights Builder</div>
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4, lineHeight: 1.6 }}>
          Pick filters for each group, optionally cross-join with another dataset by email, and compare the result. Every
          number is clickable to see the leads it represents. Nothing is pre-baked — you can ask any question the data can
          answer.
        </div>
      </div>

      {/* Controls */}
      <div className="controls-bar" style={{ marginBottom: 20 }}>
        <div className="control-group">
          <button className={`preset-btn ${displayMode === "count" ? "active" : ""}`} onClick={() => setDisplayMode("count")}>
            Show Count
          </button>
          <button className={`preset-btn ${displayMode === "percent" ? "active" : ""}`} onClick={() => setDisplayMode("percent")}>
            Show %
          </button>
        </div>

        <label className="toggle-chip">
          <input type="checkbox" checked={crossEnabled} onChange={(e) => setCrossEnabled(e.target.checked)} />
          Cross-join with another dataset
        </label>

        {crossEnabled && (
          <>
            <select
              className="select-input"
              value={cross.crossWith}
              onChange={(e) => setCross({ ...cross, crossWith: e.target.value as DatasetKey, crossFilters: [] })}
            >
              {datasets
                .filter((d) => d.fields.some((f) => f.emailField))
                .map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.icon} {d.label}
                  </option>
                ))}
            </select>
            <CrossFilterEditor
              cross={cross}
              datasets={datasets}
              bundle={bundle}
              onChange={(next) => setCross(next)}
            />
          </>
        )}

        <div className="spacer" />

        <label className="toggle-chip">
          <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
          Include test records
        </label>
      </div>

      {/* Groups grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${groups.length}, minmax(280px, 1fr))`,
          gap: 14,
          marginBottom: 20,
        }}
      >
        {groups.map((group) => (
          <GroupEditor
            key={group.id}
            group={group}
            datasets={datasets}
            bundle={bundle}
            onChangeDataset={(k) => updateGroup(group.id, { datasetKey: k, filters: [] })}
            onChangeLabel={(v) => updateGroup(group.id, { label: v })}
            onAddFilter={() => addFilter(group.id)}
            onUpdateFilter={(idx, patch) => updateFilter(group.id, idx, patch)}
            onRemoveFilter={(idx) => removeFilter(group.id, idx)}
            onRemove={groups.length > 1 ? () => removeGroup(group.id) : undefined}
          />
        ))}
        {groups.length < 4 && (
          <button
            onClick={addGroup}
            style={{
              background: "transparent",
              border: "2px dashed var(--line)",
              borderRadius: 14,
              color: "var(--muted)",
              fontSize: 13,
              cursor: "pointer",
              minHeight: 200,
              padding: 18,
              transition: "border-color 0.15s ease, color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "";
              e.currentTarget.style.color = "";
            }}
          >
            + Add another group
          </button>
        )}
      </div>

      {/* Results */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Results</div>
          <span style={{ color: "var(--muted)", fontSize: 11 }}>
            {formatNumber(totalBase)} total rows matched · click any number to see the leads
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${results.length}, minmax(200px, 1fr))`,
            gap: 14,
          }}
        >
          {results.map((r) => {
            const dataset = datasets.find((d) => d.key === r.group.datasetKey)!;
            const crossDataset = crossEnabled ? datasets.find((d) => d.key === cross.crossWith)! : null;

            const primaryValue = crossEnabled
              ? displayMode === "count"
                ? formatNumber(r.crossMatchedCount)
                : formatPercent(r.conversionRate)
              : formatNumber(r.baseCount);

            const secondary = crossEnabled
              ? displayMode === "count"
                ? `of ${formatNumber(r.baseCount)} in group (${formatPercent(r.conversionRate)})`
                : `${formatNumber(r.crossMatchedCount)} of ${formatNumber(r.baseCount)}`
              : `${dataset.label} matching filters`;

            return (
              <div
                key={r.group.id}
                style={{
                  background: "var(--gradient-surface)",
                  border: `1px solid ${r.group.color}`,
                  borderRadius: 14,
                  padding: 18,
                  boxShadow: "var(--shadow-card)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: r.group.color, opacity: 0.6 }} />
                <div style={{ fontSize: 11, letterSpacing: 0.06, textTransform: "uppercase", color: r.group.color, fontWeight: 600 }}>
                  {r.group.label}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                  {dataset.icon} {dataset.label}
                  {r.group.filters.length > 0 && ` · ${r.group.filters.length} filter${r.group.filters.length === 1 ? "" : "s"}`}
                </div>
                <button
                  onClick={() => setDrilldown({ title: r.group.label, rows: crossEnabled ? r.crossMatched : r.base, group: r.group })}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    marginTop: 12,
                    textAlign: "left",
                    width: "100%",
                    color: "var(--text)",
                  }}
                >
                  <div className="mono" style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.02em", color: r.group.color, lineHeight: 1 }}>
                    {primaryValue}
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 6 }}>{secondary}</div>
                  {r.revenue > 0 && (
                    <div style={{ color: "var(--green)", fontSize: 12, marginTop: 6, fontFamily: "var(--font-mono)" }}>
                      {formatMoney(r.revenue)} revenue attributed
                    </div>
                  )}
                  <div style={{ color: "var(--muted)", fontSize: 10, marginTop: 10, textTransform: "uppercase", letterSpacing: 0.05 }}>
                    ↗ Click to see leads
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Comparison summary */}
        {crossEnabled && results.length >= 2 && (
          <ComparisonSummary results={results} datasets={datasets} crossWith={cross.crossWith} />
        )}
      </div>

      <DrillDownModal
        open={!!drilldown}
        onClose={() => setDrilldown(null)}
        title={drilldown?.title || ""}
        subtitle={drilldown ? `${drilldown.rows.length} leads matched` : ""}
      >
        {drilldown && <LeadTable rows={drilldown.rows} dataset={datasets.find((d) => d.key === drilldown.group.datasetKey)!} />}
      </DrillDownModal>
    </div>
  );
}

function ComparisonSummary({
  results,
  datasets,
  crossWith,
}: {
  results: ReturnType<typeof computeGroup>[];
  datasets: DatasetDef[];
  crossWith: DatasetKey;
}) {
  if (results.length < 2) return null;
  const [a, b] = results;
  const rateA = a.conversionRate;
  const rateB = b.conversionRate;
  if (rateA === null || rateB === null) return null;

  const diffPts = (rateA - rateB) * 100;
  const higher = diffPts >= 0 ? a : b;
  const lower = diffPts >= 0 ? b : a;
  const absDiff = Math.abs(diffPts);
  const crossLabel = datasets.find((d) => d.key === crossWith)?.label || "cross-source";

  return (
    <div
      style={{
        marginTop: 18,
        padding: "14px 16px",
        background: "linear-gradient(90deg, rgba(69,208,147,0.06), transparent)",
        border: "1px solid rgba(69,208,147,0.25)",
        borderRadius: 10,
        fontSize: 13,
      }}
    >
      <span style={{ color: higher.group.color, fontWeight: 600 }}>{higher.group.label}</span> converts{" "}
      <span className="mono" style={{ color: "var(--green)", fontWeight: 600 }}>
        {absDiff.toFixed(1)}pts higher
      </span>{" "}
      than <span style={{ color: lower.group.color, fontWeight: 600 }}>{lower.group.label}</span> at the {crossLabel} step.
    </div>
  );
}

function GroupEditor({
  group,
  datasets,
  bundle,
  onChangeDataset,
  onChangeLabel,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onRemove,
}: {
  group: QueryGroup;
  datasets: DatasetDef[];
  bundle: DataBundle;
  onChangeDataset: (k: DatasetKey) => void;
  onChangeLabel: (v: string) => void;
  onAddFilter: () => void;
  onUpdateFilter: (idx: number, patch: Partial<FilterRule>) => void;
  onRemoveFilter: (idx: number) => void;
  onRemove?: () => void;
}) {
  const dataset = datasets.find((d) => d.key === group.datasetKey)!;
  const rows = getRowsForDataset(group.datasetKey, bundle);

  return (
    <div
      style={{
        background: "var(--gradient-surface)",
        border: `1px solid var(--line)`,
        borderLeft: `4px solid ${group.color}`,
        borderRadius: 14,
        padding: 16,
        boxShadow: "var(--shadow-card)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <input
          value={group.label}
          onChange={(e) => onChangeLabel(e.target.value)}
          style={{
            background: "transparent",
            border: "none",
            color: group.color,
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 0.02,
            padding: 0,
            width: "100%",
          }}
        />
        {onRemove && (
          <button
            onClick={onRemove}
            style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14 }}
            title="Remove group"
          >
            ✕
          </button>
        )}
      </div>

      <select
        className="select-input"
        value={group.datasetKey}
        onChange={(e) => onChangeDataset(e.target.value as DatasetKey)}
      >
        {datasets.map((d) => (
          <option key={d.key} value={d.key}>
            {d.icon} {d.label}
          </option>
        ))}
      </select>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {group.filters.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 11, fontStyle: "italic" }}>No filters — all rows in {dataset.label}</div>
        )}
        {group.filters.map((rule, idx) => (
          <FilterRow
            key={idx}
            rule={rule}
            dataset={dataset}
            rows={rows}
            onChange={(patch) => onUpdateFilter(idx, patch)}
            onRemove={() => onRemoveFilter(idx)}
          />
        ))}
      </div>

      <button
        onClick={onAddFilter}
        style={{
          background: "var(--surface-2)",
          border: "1px dashed var(--line-strong)",
          borderRadius: 8,
          color: "var(--muted)",
          fontSize: 12,
          padding: "8px 12px",
          cursor: "pointer",
          transition: "color 0.15s ease, border-color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = group.color;
          e.currentTarget.style.borderColor = group.color;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "";
          e.currentTarget.style.borderColor = "";
        }}
      >
        + Add filter
      </button>

      <div style={{ color: "var(--muted)", fontSize: 10, marginTop: 4 }}>
        {formatNumber(applyFilters(dataset, rows, group.filters).length)} of {formatNumber(rows.length)} rows match
      </div>
    </div>
  );
}

function FilterRow({
  rule,
  dataset,
  rows,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  dataset: DatasetDef;
  rows: any[];
  onChange: (patch: Partial<FilterRule>) => void;
  onRemove: () => void;
}) {
  const field = dataset.fields.find((f) => f.key === rule.fieldKey);
  const type = field?.type || "text";
  const ops = OPS_FOR_TYPE[type] || ["eq"];
  const opts = field ? optionsFor(dataset, field, rows) : [];
  const needsValue = !["isEmpty", "isNotEmpty"].includes(rule.op);
  const isMulti = ["in", "notIn"].includes(rule.op);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 6,
        padding: "8px 10px",
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        position: "relative",
      }}
    >
      <select
        className="select-input"
        value={rule.fieldKey}
        onChange={(e) => {
          const newField = dataset.fields.find((f) => f.key === e.target.value);
          const newOps = OPS_FOR_TYPE[newField?.type || "text"];
          onChange({ fieldKey: e.target.value, op: newOps[0] as any, value: "", valueList: [], valueNum: undefined });
        }}
        style={{ fontSize: 11, padding: "5px 8px" }}
      >
        {dataset.fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <select
        className="select-input"
        value={rule.op}
        onChange={(e) => onChange({ op: e.target.value as any })}
        style={{ fontSize: 11, padding: "5px 8px" }}
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </select>

      {needsValue && !isMulti && type === "select" && (
        <select
          className="select-input"
          value={rule.value || ""}
          onChange={(e) => onChange({ value: e.target.value })}
          style={{ fontSize: 11, padding: "5px 8px", gridColumn: "1 / -1" }}
        >
          <option value="">— select —</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}

      {needsValue && !isMulti && type === "boolean" && (
        <select
          className="select-input"
          value={rule.value || "true"}
          onChange={(e) => onChange({ value: e.target.value })}
          style={{ fontSize: 11, padding: "5px 8px", gridColumn: "1 / -1" }}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )}

      {needsValue && !isMulti && type === "number" && (
        <input
          type="number"
          className="text-input"
          value={rule.valueNum ?? ""}
          onChange={(e) => onChange({ valueNum: e.target.value === "" ? undefined : Number(e.target.value) })}
          placeholder="value"
          style={{ fontSize: 11, padding: "5px 8px", gridColumn: "1 / -1", minWidth: 0 }}
        />
      )}

      {needsValue && !isMulti && (type === "text" || type === "date") && (
        <input
          type={type === "date" ? "date" : "text"}
          className="text-input"
          value={rule.value || ""}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="value"
          style={{ fontSize: 11, padding: "5px 8px", gridColumn: "1 / -1", minWidth: 0 }}
        />
      )}

      {needsValue && isMulti && (
        <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 4 }}>
          {opts.map((o) => {
            const active = (rule.valueList || []).includes(o);
            return (
              <button
                key={o}
                onClick={() => {
                  const list = rule.valueList || [];
                  onChange({ valueList: active ? list.filter((x) => x !== o) : [...list, o] });
                }}
                style={{
                  background: active ? "var(--accent)" : "var(--surface-2)",
                  color: active ? "#1a1204" : "var(--text)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                  borderRadius: 5,
                  padding: "3px 8px",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={onRemove}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          background: "transparent",
          border: "none",
          color: "var(--muted)",
          fontSize: 12,
          cursor: "pointer",
          padding: 2,
        }}
        title="Remove filter"
      >
        ✕
      </button>
    </div>
  );
}

function CrossFilterEditor({
  cross,
  datasets,
  bundle,
  onChange,
}: {
  cross: CrossJoin;
  datasets: DatasetDef[];
  bundle: DataBundle;
  onChange: (next: CrossJoin) => void;
}) {
  const dataset = datasets.find((d) => d.key === cross.crossWith);
  if (!dataset) return null;
  const rows = getRowsForDataset(cross.crossWith, bundle);
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((x) => !x)}
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          color: "var(--muted)",
          fontSize: 11,
          padding: "6px 10px",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        {cross.crossFilters.length === 0 ? "All rows" : `${cross.crossFilters.length} filter${cross.crossFilters.length === 1 ? "" : "s"}`}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            background: "var(--surface-2)",
            border: "1px solid var(--line-strong)",
            borderRadius: 10,
            padding: 10,
            width: 320,
            zIndex: 30,
            boxShadow: "0 12px 30px -12px rgba(0,0,0,0.5)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.06 }}>
            Filter the cross-source rows
          </div>
          {cross.crossFilters.map((rule, idx) => (
            <FilterRow
              key={idx}
              rule={rule}
              dataset={dataset}
              rows={rows}
              onChange={(patch) =>
                onChange({ ...cross, crossFilters: cross.crossFilters.map((f, i) => (i === idx ? { ...f, ...patch } : f)) })
              }
              onRemove={() => onChange({ ...cross, crossFilters: cross.crossFilters.filter((_, i) => i !== idx) })}
            />
          ))}
          <button
            onClick={() => {
              const first = dataset.fields[0];
              onChange({
                ...cross,
                crossFilters: [...cross.crossFilters, { fieldKey: first.key, op: OPS_FOR_TYPE[first.type][0] as any }],
              });
            }}
            style={{
              background: "transparent",
              border: "1px dashed var(--line-strong)",
              borderRadius: 6,
              color: "var(--muted)",
              fontSize: 11,
              padding: "6px 8px",
              cursor: "pointer",
            }}
          >
            + Add filter
          </button>
        </div>
      )}
    </div>
  );
}

function LeadTable({ rows, dataset }: { rows: any[]; dataset: DatasetDef }) {
  const cols = dataset.fields.filter((f) => f.type !== "date").slice(0, 8);
  return (
    <table style={{ width: "100%", fontSize: 12 }}>
      <thead>
        <tr>
          {cols.map((c) => (
            <th key={c.key} style={{ textAlign: "left", padding: "8px 12px", color: "var(--muted)", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.05 }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 300).map((r, idx) => (
          <tr key={idx} style={{ borderTop: "1px solid var(--line)" }}>
            {cols.map((c) => {
              const v = c.get(r);
              const display = v === null || v === undefined ? "—" : typeof v === "number" ? formatNumber(v) : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
              return (
                <td key={c.key} style={{ padding: "8px 12px" }} className="mono">
                  {display}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
