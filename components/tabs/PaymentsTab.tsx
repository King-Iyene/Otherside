"use client";

import { useState } from "react";
import type { CashRow } from "@/lib/types";
import PaymentAnomalies from "../PaymentAnomalies";

/**
 * Payments tab — home of the Payment Anomalies engine. Cross-row, per-person
 * checks (plan total vs recorded, cohort split on installments, overdue
 * payments, duplicate rows) that the row-level Data Health can't do.
 */
export default function PaymentsTab({ rows }: { rows: CashRow[] }) {
  const [includeTest, setIncludeTest] = useState(false);

  return (
    <div>
      <div
        style={{
          background: "linear-gradient(135deg, rgba(240,112,112,0.08), rgba(245,158,11,0.05))",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: "18px 20px",
          marginBottom: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>Payment Anomalies</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4, maxWidth: 680, lineHeight: 1.5 }}>
            Looks at every buyer&apos;s payment plan across all their rows and flags what the single-row checks can&apos;t:
            the money doesn&apos;t add up to the stated plan total, recurring installments tagged to the wrong cohort, a
            scheduled payment that&apos;s overdue, or duplicate rows. Click a person to see the details and the rows involved.
          </div>
        </div>
        <label className="toggle-chip">
          <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
          Include test records
        </label>
      </div>

      <PaymentAnomalies rows={rows} includeTest={includeTest} />
    </div>
  );
}
