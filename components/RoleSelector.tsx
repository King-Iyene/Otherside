"use client";

import { ROLES, roleDef, type Role } from "@/lib/roles";

/**
 * "Viewing as" role lens. Presentation only — curates which tabs show for the
 * selected role so each person sees their slice. Not access control (real
 * per-user sign-in comes later); no commission data is exposed by this control.
 */
export default function RoleSelector({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 12px" }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.06, color: "var(--muted)", fontWeight: 700 }}>
          Viewing as
        </span>
        <select
          value={role}
          onChange={(e) => onChange(e.target.value as Role)}
          className="text-input"
          style={{ padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", minWidth: 150 }}
        >
          {ROLES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{roleDef(role).blurb}</span>
    </div>
  );
}
