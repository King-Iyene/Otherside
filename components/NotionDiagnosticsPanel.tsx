"use client";

import { useEffect, useState } from "react";
import type { NotionAccessInfo } from "@/lib/notionDiagnostics";

const EXECUTION_SYSTEM_URL = "https://www.notion.so/309c23866468800abadec2a2f6ac6bb7";

export default function NotionDiagnosticsPanel({ alwaysShow = false }: { alwaysShow?: boolean }) {
  const [data, setData] = useState<NotionAccessInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/notion-diagnostics", { cache: "no-store" });
      const json = (await res.json()) as NotionAccessInfo;
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/notion/disconnect", { method: "POST" });
      await load();
      // Also trigger a fresh dashboard reload
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  function connect() {
    window.location.href = "/api/notion/connect?next=/";
  }

  if (!data) {
    return (
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">Notion Access</div>
        <p style={{ color: "var(--muted)", marginTop: 8 }}>Checking token access…</p>
      </div>
    );
  }

  const anyTargetFailing = data.targets.some((t) => !t.ok);
  const hasIssue = !!data.tokenError || anyTargetFailing || !data.bot;

  // When everything is healthy, stay collapsed to a quiet status pill — no
  // "Connect" button (nothing to fix). The full panel + Connect button only
  // appear when there's an actual access problem.
  if (!hasIssue) {
    return (
      <div
        className="panel"
        style={{
          marginBottom: 12,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderColor: "rgba(69, 208, 147, 0.25)",
        }}
      >
        <span className="badge" style={{ color: "var(--green)", border: "1px solid var(--green)" }}>
          NOTION OK
        </span>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          Connected as <span className="mono">{data.connectedUser?.name || data.bot?.name || "integration"}</span>
          {data.connectedUser?.workspaceName && ` in ${data.connectedUser.workspaceName}`}
          {data.authMode === "env" && " · workspace token"}
        </span>
        <div className="spacer" />
        {data.authMode === "oauth" && (
          <button className="link-btn" onClick={disconnect} disabled={busy}>
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
        <button className="link-btn" onClick={load} disabled={loading}>
          {loading ? "Re-checking…" : "Re-check"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="panel"
      style={{
        marginBottom: 16,
        borderColor: hasIssue ? "var(--red)" : "var(--line)",
        background: hasIssue
          ? "linear-gradient(180deg, rgba(240,112,112,0.08), rgba(240,112,112,0.02))"
          : "var(--gradient-surface)",
      }}
    >
      <div className="panel-header">
        <div className="panel-title" style={{ color: hasIssue ? "var(--red)" : "var(--text)" }}>
          Notion Access {hasIssue ? "— Action Required" : "— All Good"}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {data.authMode !== "oauth" && (
            <button className="refresh-btn" onClick={connect}>
              Connect my Notion account
            </button>
          )}
          {data.authMode === "oauth" && (
            <button
              onClick={disconnect}
              disabled={busy}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--line)",
                color: "var(--text)",
                borderRadius: 8,
                padding: "7px 14px",
                fontSize: 12,
                cursor: busy ? "default" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </button>
          )}
          <button className="link-btn" onClick={() => setExpanded((x) => !x)}>
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={load}
            disabled={loading}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              color: "var(--text)",
              borderRadius: 8,
              padding: "7px 14px",
              fontSize: 12,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading ? "Re-checking…" : "Re-check"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
          <section>
            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 4 }}>
              Auth Method
            </div>
            {data.authMode === "oauth" ? (
              <div>
                <span className="badge" style={{ color: "var(--green)", border: "1px solid var(--green)" }}>
                  OAUTH
                </span>{" "}
                <span className="mono">Your Notion account is connected</span>
                {data.connectedUser?.name && <span style={{ color: "var(--muted)" }}> · {data.connectedUser.name}</span>}
                {data.connectedUser?.workspaceName && (
                  <span style={{ color: "var(--muted)" }}> · Workspace: {data.connectedUser.workspaceName}</span>
                )}
              </div>
            ) : data.authMode === "env" ? (
              <div>
                <span className="badge muted">WORKSPACE TOKEN</span>{" "}
                <span className="mono" style={{ color: "var(--muted)" }}>
                  Falling back to NOTION_TOKEN env var (integration).
                </span>
              </div>
            ) : (
              <div style={{ color: "var(--red)" }}>
                <span className="badge red">NO AUTH</span> No OAuth cookie and no NOTION_TOKEN env var. Connect your account to
                proceed.
              </div>
            )}
          </section>

          {data.bot && (
            <section>
              <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 4 }}>
                Token identity
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div>
                  <span style={{ color: "var(--muted)" }}>Integration name: </span>
                  <span className="mono">{data.bot.name || "(unnamed)"}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Workspace: </span>
                  <span className="mono" style={{ color: "var(--accent)" }}>
                    {data.bot.workspaceName || "(unknown)"}
                  </span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Owner type: </span>
                  <span className="mono">{data.bot.ownerType || "(unknown)"}</span>
                </div>
              </div>
            </section>
          )}

          <section>
            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 4 }}>
              Required databases
            </div>
            <table className="leaderboard">
              <thead>
                <tr>
                  <th>Database</th>
                  <th>Access</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {data.targets.map((t) => (
                  <tr key={t.databaseId}>
                    <td>{t.label}</td>
                    <td>
                      {t.ok ? (
                        <span className="badge" style={{ color: "var(--green)", border: "1px solid var(--green)" }}>
                          OK
                        </span>
                      ) : (
                        <span className="badge red">{t.errorCode || "FAIL"}</span>
                      )}
                    </td>
                    <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                      {t.ok ? "Reachable" : t.errorMessage}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 4 }}>
              What this token CAN see ({data.accessible.databases} databases, {data.accessible.pages} pages)
            </div>
            {data.accessible.databases === 0 && data.accessible.pages === 0 ? (
              <div style={{ color: "var(--red)" }}>
                Zero databases and zero pages visible. Token is either in the wrong workspace or has never been added to any page.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 4 }}>Databases visible</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text)", fontSize: 12 }}>
                    {data.accessible.databaseTitles.slice(0, 15).map((t, i) => (
                      <li key={i} className="mono">
                        {t}
                      </li>
                    ))}
                    {data.accessible.databaseTitles.length === 0 && <li style={{ color: "var(--muted)" }}>None</li>}
                  </ul>
                </div>
                <div>
                  <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 4 }}>Sample pages visible</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text)", fontSize: 12 }}>
                    {data.accessible.samplePageTitles.map((t, i) => (
                      <li key={i} className="mono">
                        {t}
                      </li>
                    ))}
                    {data.accessible.samplePageTitles.length === 0 && <li style={{ color: "var(--muted)" }}>None</li>}
                  </ul>
                </div>
              </div>
            )}
          </section>

          {anyTargetFailing && (
            <section style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div style={{ color: "var(--accent)", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Two ways to fix this
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Option 1 — Connect your own Notion account (easy, no admin needed)</div>
                  <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text-dim)", fontSize: 12, lineHeight: 1.6 }}>
                    <li>Click <strong>Connect my Notion account</strong> above.</li>
                    <li>Notion will ask which pages to give the dashboard access to.</li>
                    <li>Select <strong>Execution System</strong> (and it cascades to all 4 databases).</li>
                    <li>You&apos;ll land back here — targets flip to OK.</li>
                  </ol>
                </div>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Option 2 — Share the workspace token (needs admin)</div>
                  <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text-dim)", fontSize: 12, lineHeight: 1.6 }}>
                    <li>
                      Open{" "}
                      <a href={EXECUTION_SYSTEM_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>
                        Execution System
                      </a>{" "}
                      in Notion.
                    </li>
                    <li>
                      Click <strong>•••</strong> → <strong>Connections</strong> → add the integration (accept sub-page cascade).
                    </li>
                    <li>Come back and hit <strong>Re-check</strong>.</li>
                  </ol>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
