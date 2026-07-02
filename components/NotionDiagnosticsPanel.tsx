"use client";

import { useEffect, useState } from "react";
import type { NotionAccessInfo } from "@/lib/notionDiagnostics";

const EXECUTION_SYSTEM_URL = "https://www.notion.so/309c23866468800abadec2a2f6ac6bb7";

export default function NotionDiagnosticsPanel() {
  const [data, setData] = useState<NotionAccessInfo | null>(null);
  const [loading, setLoading] = useState(false);
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

  const anyTargetFailing = data?.targets.some((t) => !t.ok);
  if (!data) {
    return (
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-title">Notion Access Diagnostics</div>
        <p style={{ color: "var(--muted)", marginTop: 8 }}>Checking token access…</p>
      </div>
    );
  }

  // Only render the panel when something is wrong; otherwise a small collapsible summary
  const hasIssue = !!data.tokenError || anyTargetFailing || !data.bot;

  return (
    <div
      className="panel"
      style={{
        marginBottom: 16,
        borderColor: hasIssue ? "var(--red)" : "var(--line)",
        background: hasIssue ? "rgba(240,112,112,0.06)" : "var(--surface)",
      }}
    >
      <div className="panel-header">
        <div className="panel-title" style={{ color: hasIssue ? "var(--red)" : "var(--text)" }}>
          Notion Access Diagnostics {hasIssue ? "— Action Required" : "— All Good"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="link-btn" onClick={() => setExpanded((x) => !x)}>
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button className="refresh-btn" onClick={load} disabled={loading}>
            {loading ? "Re-checking…" : "Re-check"}
          </button>
        </div>
      </div>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
          <section>
            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 4 }}>
              Connected Token
            </div>
            {data.tokenError ? (
              <div style={{ color: "var(--red)" }}>{data.tokenError}</div>
            ) : data.bot ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div>
                  <span style={{ color: "var(--muted)" }}>Integration name: </span>
                  <span className="mono">{data.bot.name || "(unnamed)"}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Workspace: </span>
                  <span className="mono" style={{ color: "var(--accent)" }}>{data.bot.workspaceName || "(unknown)"}</span>
                </div>
                <div>
                  <span style={{ color: "var(--muted)" }}>Owner type: </span>
                  <span className="mono">{data.bot.ownerType || "(unknown)"}</span>
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--red)" }}>Could not authenticate token against Notion. Double-check NOTION_TOKEN in Vercel env vars.</div>
            )}
          </section>

          <section>
            <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 4 }}>
              Required Databases
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
                        <span className="badge" style={{ color: "var(--green)", border: "1px solid var(--green)" }}>OK</span>
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
              What this token CAN see ({data.accessible.databases} databases, {data.accessible.pages} pages returned by /v1/search)
            </div>
            {data.accessible.databases === 0 && data.accessible.pages === 0 ? (
              <div style={{ color: "var(--red)" }}>
                Zero databases and zero pages visible. The token is either in the wrong workspace or has never been added to any page.
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 4 }}>Databases visible</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text)", fontSize: 12 }}>
                    {data.accessible.databaseTitles.slice(0, 15).map((t, i) => (
                      <li key={i} className="mono">{t}</li>
                    ))}
                    {data.accessible.databaseTitles.length === 0 && <li style={{ color: "var(--muted)" }}>None</li>}
                  </ul>
                </div>
                <div>
                  <div style={{ color: "var(--muted)", fontSize: 11, marginBottom: 4 }}>Sample pages visible</div>
                  <ul style={{ margin: 0, paddingLeft: 16, color: "var(--text)", fontSize: 12 }}>
                    {data.accessible.samplePageTitles.map((t, i) => (
                      <li key={i} className="mono">{t}</li>
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
                How to fix
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text)", fontSize: 12, lineHeight: 1.6 }}>
                <li>
                  Confirm the workspace shown above is <strong>Otherside</strong>. If it says <em>King Iyene's Workspace</em>, the token was
                  created in the wrong workspace — generate a new one inside Otherside and swap NOTION_TOKEN in Vercel.
                </li>
                <li>
                  Open the parent page{" "}
                  <a href={EXECUTION_SYSTEM_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)" }}>
                    Execution System
                  </a>{" "}
                  in Notion.
                </li>
                <li>Click <strong>•••</strong> (top right) → <strong>Connections</strong> → add your integration.</li>
                <li>Come back here and click <strong>Re-check</strong>. All four databases should flip to OK.</li>
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
