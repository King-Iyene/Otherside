"use client";

import { useMemo, useState } from "react";
import type { ApplicationRow, AppointmentRow, CashRow, ChallengeRow, SalesActivityRow } from "@/lib/types";
import {
  applyFilters,
  buildDatasets,
  canCrossJoin,
  computeGroup,
  describeGroup,
  getRowsForDataset,
  optionsFor,
  OP_LABELS_SALES,
  COHORT_PRESETS,
  type CohortPreset,
  type CrossJoin,
  type DataBundle,
  type DatasetDef,
  type DatasetKey,
  type FieldDef,
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

const OP_LABELS = OP_LABELS_SALES;

const OPS_FOR_TYPE: Record<string, string[]> = {
  // Multi-select ("in") is now the default for select fields so you can immediately
  // check "$50k-$100k" + "$100k-$250k" as one bucket without changing the operator.
  select: ["in", "notIn", "eq", "neq", "isEmpty", "isNotEmpty"],
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

function filterableFields(dataset: DatasetDef): FieldDef[] {
  return dataset.fields.filter((f) => f.filterable !== false);
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
    makeEmptyGroup("applications", "", "var(--accent)"),
    makeEmptyGroup("applications", "", "var(--blue)"),
  ]);
  const [crossEnabled, setCrossEnabled] = useState(true);
  const [cross, setCross] = useState<CrossJoin>({ crossWith: "cash", crossFilters: [] });
  const [displayMode, setDisplayMode] = useState<"count" | "percent">("percent");
  const [drilldown, setDrilldown] = useState<{ title: string; rows: any[]; group: QueryGroup } | null>(null);

  const someGroupIsAggregatePeek = groups.some((g) => !canCrossJoin(g.datasetKey));
  const results = useMemo(
    () => groups.map((g) => computeGroup(g, datasets, bundle, crossEnabled && !someGroupIsAggregatePeek ? cross : null, includeTest)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, datasets, cross, crossEnabled, includeTest, cash, appointments, applications, salesActivity, challenge, someGroupIsAggregatePeek]
  );

  function updateGroup(id: string, patch: Partial<QueryGroup>) {
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function addFilter(groupId: string) {
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== groupId) return g;
        const dataset = datasets.find((d) => d.key === g.datasetKey);
        if (!dataset) return g;
        const firstField = filterableFields(dataset)[0];
        if (!firstField) return g;
        const defaultOp = OPS_FOR_TYPE[firstField.type][0] as any;
        const newRule: FilterRule = {
          fieldKey: firstField.key,
          op: defaultOp,
          valueList: ["in", "notIn"].includes(defaultOp) ? [] : undefined,
        };
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
    setGroups((gs) => [...gs, makeEmptyGroup("applications", "", palette[gs.length] || "var(--accent)")]);
  }

  function removeGroup(id: string) {
    setGroups((gs) => (gs.length <= 1 ? gs : gs.filter((g) => g.id !== id)));
  }

  /** Options snapshot for a dataset — for preset resolution. */
  function optsFor(datasetKey: DatasetKey): Record<string, string[]> {
    const dataset = datasets.find((d) => d.key === datasetKey);
    if (!dataset) return {};
    const rows = getRowsForDataset(datasetKey, bundle);
    const map: Record<string, string[]> = {};
    for (const f of dataset.fields) {
      if (f.type === "select" || f.type === "text") {
        map[f.key] = optionsFor(dataset, f, rows);
      }
    }
    return map;
  }

  /** Apply a preset to a group: figure out best dataset, populate filters. */
  function applyPreset(groupId: string, preset: CohortPreset) {
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== groupId) return g;
        // Prefer the group's current dataset if the preset applies to it; else use first supported one
        const targetKey = preset.appliesTo.includes(g.datasetKey) ? g.datasetKey : preset.appliesTo[0];
        const filters = preset.buildFilters(targetKey, optsFor(targetKey));
        if (!filters) return g;
        return { ...g, datasetKey: targetKey, filters, label: preset.label };
      })
    );
  }

  /** Auto-disable cross-join if a group is on an aggregate dataset. */
  const someGroupIsAggregate = groups.some((g) => !canCrossJoin(g.datasetKey));
  const effectiveCrossEnabled = crossEnabled && !someGroupIsAggregate;

  const totalBase = results.reduce((s, r) => s + r.baseCount, 0);
  const crossDatasetLabel = datasets.find((d) => d.key === cross.crossWith)?.label || "";

  return (
    <div>
      {/* Header — hero card with glass finish */}
      <div className="insights-hero" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="gradient-text" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, letterSpacing: 0.02 }}>
              Insights Builder
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4, lineHeight: 1.6, maxWidth: 720 }}>
              Compare any two (or four) slices of your data. Use a preset below for one-click cohorts, or build custom
              filters per group. Every number is clickable to see the actual leads.
            </div>
          </div>

          {/* Explicit comparison-mode indicator */}
          <div
            style={{
              padding: "8px 14px",
              background: "var(--surface-2)",
              border: `1px solid ${effectiveCrossEnabled ? "var(--green)" : "var(--line-strong)"}`,
              borderRadius: 10,
              fontSize: 11,
              lineHeight: 1.4,
              maxWidth: 260,
            }}
          >
            <div style={{ color: "var(--muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.08, marginBottom: 4 }}>
              You are comparing
            </div>
            {effectiveCrossEnabled ? (
              <div style={{ color: "var(--text)", fontWeight: 500 }}>
                Leads by email — matched into <span style={{ color: "var(--green)" }}>{crossDatasetLabel}</span>
              </div>
            ) : someGroupIsAggregate ? (
              <div style={{ color: "var(--accent)" }}>
                Aggregate rows only (Sales Activity has no email — email join disabled)
              </div>
            ) : (
              <div style={{ color: "var(--text)", fontWeight: 500 }}>Raw row counts (no cross-join)</div>
            )}
          </div>
        </div>

        {/* Preset chip strip */}
        <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div style={{ color: "var(--muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.08, marginBottom: 8 }}>
            Quick Presets — click to load into a group
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {COHORT_PRESETS.map((p) => (
              <PresetChip
                key={p.id}
                preset={p}
                groups={groups}
                onApply={(gid) => applyPreset(gid, p)}
              />
            ))}
          </div>
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
          {results.map((r, idx) => (
            <ResultCard
              key={r.group.id}
              result={r}
              others={results.filter((_, i) => i !== idx)}
              datasets={datasets}
              crossEnabled={effectiveCrossEnabled}
              displayMode={displayMode}
              onDrilldown={(mode) =>
                setDrilldown({
                  title: `${r.group.label} · ${mode === "matched" ? "cross-matched leads" : "all in group"}`,
                  rows: mode === "matched" ? r.crossMatched : r.base,
                  group: r.group,
                })
              }
            />
          ))}
        </div>

        {/* Comparison summary */}
        {effectiveCrossEnabled && results.length >= 2 && (
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

function ResultCard({
  result,
  others,
  datasets,
  crossEnabled,
  displayMode,
  onDrilldown,
}: {
  result: ReturnType<typeof computeGroup>;
  others: ReturnType<typeof computeGroup>[];
  datasets: DatasetDef[];
  crossEnabled: boolean;
  displayMode: "count" | "percent";
  onDrilldown: (mode: "matched" | "all") => void;
}) {
  const dataset = datasets.find((d) => d.key === result.group.datasetKey)!;
  const rate = result.conversionRate;
  const avgDeal =
    crossEnabled && result.crossMatchedCount > 0 ? result.revenue / result.crossMatchedCount : null;

  // Compute deltas vs each other group
  const deltas = others.map((o) => {
    const oRate = o.conversionRate;
    const rateDelta = rate !== null && oRate !== null ? rate - oRate : null;
    const countDelta = crossEnabled ? result.crossMatchedCount - o.crossMatchedCount : result.baseCount - o.baseCount;
    const revenueDelta = result.revenue - o.revenue;
    return { other: o, rateDeltaPts: rateDelta, countDelta, revenueDelta };
  });

  return (
    <div
      style={{
        background: "var(--gradient-surface)",
        border: `1px solid ${result.group.color}`,
        borderRadius: 14,
        padding: 18,
        boxShadow: "var(--shadow-card)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: result.group.color, opacity: 0.6 }} />

      <div style={{ fontSize: 13, color: result.group.color, fontWeight: 700, fontFamily: "var(--font-display)", letterSpacing: 0.01, lineHeight: 1.3 }}>
        {result.group.label || describeGroup(result.group, dataset)}
      </div>
      <div style={{ color: "var(--muted)", fontSize: 10, marginTop: 4, textTransform: "uppercase", letterSpacing: 0.06 }}>
        {dataset.icon} {dataset.label}
      </div>

      {/* Hero metric — either the count or the percentage, whichever is toggled */}
      <button
        onClick={() => onDrilldown(crossEnabled ? "matched" : "all")}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          marginTop: 14,
          textAlign: "left",
          width: "100%",
          color: "var(--text)",
        }}
      >
        <div className="mono" style={{ fontSize: 38, fontWeight: 600, letterSpacing: "-0.03em", color: result.group.color, lineHeight: 1 }}>
          {crossEnabled
            ? displayMode === "percent"
              ? formatPercent(rate)
              : formatNumber(result.crossMatchedCount)
            : formatNumber(result.baseCount)}
        </div>
        <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 4 }}>
          {crossEnabled
            ? displayMode === "percent"
              ? "conversion rate"
              : "matched leads"
            : "leads in group"}
        </div>
      </button>

      {/* Secondary metrics — everything at once */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <SubMetric label="In group" value={formatNumber(result.baseCount)} onClick={() => onDrilldown("all")} />
        {crossEnabled && (
          <>
            <SubMetric label="Matched" value={formatNumber(result.crossMatchedCount)} onClick={() => onDrilldown("matched")} />
            <SubMetric label="Rate" value={formatPercent(rate)} />
            {result.revenue > 0 && <SubMetric label="Revenue" value={formatMoney(result.revenue)} color="var(--green)" />}
            {avgDeal !== null && avgDeal > 0 && <SubMetric label="Avg Deal" value={formatMoney(avgDeal)} color="var(--green)" />}
          </>
        )}
      </div>

      {/* Inline deltas vs other groups */}
      {deltas.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ color: "var(--muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 2 }}>
            vs other groups
          </div>
          {deltas.map(({ other, rateDeltaPts, countDelta }) => {
            const primaryDelta =
              crossEnabled && rateDeltaPts !== null
                ? {
                    text: `${rateDeltaPts >= 0 ? "▲" : "▼"} ${Math.abs(rateDeltaPts * 100).toFixed(1)}pts`,
                    color: rateDeltaPts >= 0 ? "var(--green)" : "var(--red)",
                  }
                : {
                    text: `${countDelta >= 0 ? "▲" : "▼"} ${formatNumber(Math.abs(countDelta))}`,
                    color: countDelta >= 0 ? "var(--green)" : "var(--red)",
                  };
            const otherDataset = datasets.find((d) => d.key === other.group.datasetKey)!;
            const otherLabel = other.group.label || describeGroup(other.group, otherDataset);
            return (
              <div key={other.group.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, gap: 8 }}>
                <span style={{ color: other.group.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  vs {otherLabel}
                </span>
                <span className="mono" style={{ color: primaryDelta.color, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {primaryDelta.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ color: "var(--muted)", fontSize: 9, marginTop: 12, textTransform: "uppercase", letterSpacing: 0.05, textAlign: "right" }}>
        Click any number to see leads →
      </div>
    </div>
  );
}

function PresetChip({
  preset,
  groups,
  onApply,
}: {
  preset: CohortPreset;
  groups: QueryGroup[];
  onApply: (groupId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((x) => !x)}
        style={{
          background: "var(--surface-2)",
          border: `1px solid ${preset.color}55`,
          color: "var(--text)",
          borderRadius: 20,
          padding: "6px 12px",
          fontSize: 11,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          transition: "all 0.15s ease",
          boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = `${preset.color}22`;
          e.currentTarget.style.borderColor = preset.color;
          e.currentTarget.style.boxShadow = `0 4px 16px -6px ${preset.color}66, 0 1px 0 rgba(255,255,255,0.06) inset`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--surface-2)";
          e.currentTarget.style.borderColor = `${preset.color}55`;
          e.currentTarget.style.boxShadow = "0 1px 0 rgba(255,255,255,0.03) inset";
        }}
      >
        <span>{preset.emoji}</span>
        <span style={{ fontWeight: 500 }}>{preset.label}</span>
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
            padding: 6,
            minWidth: 180,
            zIndex: 30,
            boxShadow: "0 12px 30px -12px rgba(0,0,0,0.6)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.06, padding: "4px 8px", marginBottom: 2 }}>
            Load into group
          </div>
          {groups.map((g, idx) => (
            <button
              key={g.id}
              onClick={() => {
                onApply(g.id);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "7px 10px",
                background: "transparent",
                border: "none",
                color: g.color,
                fontSize: 12,
                cursor: "pointer",
                borderRadius: 6,
                fontWeight: 500,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              → Group {idx + 1} {g.label && `(${g.label.slice(0, 24)})`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SubMetric({ label, value, color, onClick }: { label: string; value: string; color?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.15s ease",
        padding: "4px 6px",
        marginLeft: -6,
        marginRight: -6,
        borderRadius: 6,
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.06 }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, color: color || "var(--text)", fontWeight: 600, marginTop: 2 }}>
        {value}
      </div>
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
          placeholder={describeGroup(group, dataset)}
          style={{
            background: "transparent",
            border: "none",
            color: group.color,
            fontFamily: "var(--font-display)",
            fontSize: 15,
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
        {filterableFields(dataset).map((f) => (
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
            {(OP_LABELS as Record<string, string>)[op]}
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
              const first = filterableFields(dataset)[0];
              if (!first) return;
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
