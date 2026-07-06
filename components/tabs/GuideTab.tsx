"use client";

import { useState } from "react";

/**
 * "How to read this dashboard" — an A–Z guide. Plain-language, non-technical,
 * written for a sales rep or manager, not an engineer. Organized as collapsible
 * sections so it's skimmable.
 */

interface Section {
  id: string;
  icon: string;
  title: string;
  body: React.ReactNode;
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 10px", lineHeight: 1.65, color: "var(--text-dim)", fontSize: 13.5 }}>{children}</p>;
}
function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: "var(--text)", fontWeight: 600 }}>{children}</strong>;
}
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12.5,
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "8px 12px",
        margin: "0 0 12px",
        color: "var(--accent)",
        overflowX: "auto",
      }}
    >
      {children}
    </div>
  );
}
function List({ children }: { children: React.ReactNode }) {
  return <ul style={{ margin: "0 0 12px", paddingLeft: 18, lineHeight: 1.7, color: "var(--text-dim)", fontSize: 13.5 }}>{children}</ul>;
}

const SECTIONS: Section[] = [
  {
    id: "start",
    icon: "🧭",
    title: "Start here — the 30-second version",
    body: (
      <>
        <P>
          This dashboard reads live from your four Notion databases and one Google Sheet, plus Stripe for the money check.
          Nothing here is typed in by hand — every number is pulled straight from those sources each time you refresh.
        </P>
        <P>
          The top bar is your <B>pulse</B>: cash collected, revenue booked, money outstanding, and the count of data-quality
          issues to fix. Each tab below drills into one part of the business. If a number ever looks wrong, click it — most
          cards open the exact list of people or records behind them.
        </P>
      </>
    ),
  },
  {
    id: "dates",
    icon: "📅",
    title: "Date ranges & the vs Prev / vs YoY comparison",
    body: (
      <>
        <P>
          The <B>7D / 30D / 90D / MTD / YTD / Custom</B> buttons pick the window every card on that tab is measured over.
          <B> All</B> ignores dates entirely.
        </P>
        <P>
          The green/red <B>▲/▼ %</B> under a number compares your window against a baseline you choose with the
          <B> vs Prev / vs YoY</B> toggle:
        </P>
        <List>
          <li>
            <B>vs Prev</B> — the equally-long period right before your window. Pick 30D and it compares to the 30 days before
            that.
          </li>
          <li>
            <B>vs YoY</B> — the exact same dates, shifted back 12 months (year-over-year).
          </li>
        </List>
        <Formula>change % = (current − baseline) ÷ baseline</Formula>
        <P>
          It reads <B>n/a</B> when the baseline period has no data — e.g. a year-over-year comparison for a month before the
          business existed. Green vs red follows whether “up” is good for that metric — for <B>Outstanding</B>, up is bad, so
          the colors flip.
        </P>
      </>
    ),
  },
  {
    id: "overview",
    icon: "📊",
    title: "Overview tab",
    body: (
      <>
        <P>
          The big picture. The four <B>hero cards</B> (Cash Collected, Revenue Booked, Enrollments, Outstanding) are measured
          over your selected date range, each with a pace bar toward the monthly target and a trend sparkline.
        </P>
        <P>
          The <B>All-time</B> strip right below them deliberately <B>ignores the date filter</B> — it always shows lifetime
          totals so you never lose the running picture while zoomed into a week.
        </P>
        <List>
          <li>
            <B>Cash Collected</B> = money actually received. <B>Revenue Booked</B> = full deal sizes sold (including future
            installments).
          </li>
          <li>
            <B>Enrollments</B> = unique buyers (deduped by email; blank rows excluded), so it matches the Cohort Funnels count.
          </li>
          <li>The diagnostic band flags big moves (cash down 20%+, show-rate drops) with a likely cause.</li>
        </List>
      </>
    ),
  },
  {
    id: "cohorts",
    icon: "🚀",
    title: "Launches / cohorts — how they’re grouped",
    body: (
      <>
        <P>
          A <B>launch</B> (a “cohort”) is a named campaign — today Penetrate and Erupt 1/2/3. A record belongs to a launch if
          its Cohort or Product field contains that launch’s name.
        </P>
        <P>
          Naming is flexible on purpose. <B>Compound tags</B> like <code>Erupt 2 &gt; Retreat</code> still count under Erupt 2
          for all totals — the “&gt; Retreat” part just labels the sub-offer. New launches are picked up automatically: any
          new number in a series (Erupt 4, Strong 7…) shows up with zero setup.
        </P>
      </>
    ),
  },
  {
    id: "funnels",
    icon: "🔻",
    title: "Cohort Funnels & the “100%+” conversions",
    body: (
      <>
        <P>
          Each launch has a funnel: <B>Challenge Registered → Applied → Booked Call → Showed → Enrolled</B>. Every number is
          unique people (deduped by email). Click any stage to see exactly who’s in it.
        </P>
        <P>
          The <B>% “from previous stage”</B> is this stage ÷ the one above it. Sometimes it reads <B>100%+</B> — that’s not a
          bug:
        </P>
        <Formula>e.g. 45 enrolled ÷ 1 showed = 4500%</Formula>
        <P>
          It means more people reached this stage than were logged at the one before it — usually buyers who enrolled without a
          recorded “Showed” appointment. The count is right; the <B>upstream stage is under-recorded</B>. Hover the ⓘ next to
          any conversion for the exact math on that specific pair.
        </P>
      </>
    ),
  },
  {
    id: "insights",
    icon: "✦",
    title: "Insights tab",
    body: (
      <>
        <P>
          Cross-source answers a single table can’t give — it joins every dataset by email. Highlights:
        </P>
        <List>
          <li>
            <B>Challenge → Reborn</B>: which challenge registrants went on to buy the main offer, and the revenue they drove.
          </li>
          <li>
            <B>Coupon performance</B> and <B>income-bracket → purchase</B>: which discount codes and which earner brackets
            actually convert.
          </li>
          <li>
            <B>Sub-Offers Within Each Launch</B>: enrolled buyers split by the offer they bought (Reborn, Reborn Core, Retreat…)
            — taken from a <code>&gt;</code> sub-offer on the Cohort field, or inferred from the Product column.
          </li>
        </List>
        <P>Every card is clickable → see the matched leads.</P>
      </>
    ),
  },
  {
    id: "reconciliation",
    icon: "💳",
    title: "Reconciliation tab (Stripe)",
    body: (
      <>
        <P>
          A read-only cross-check between your Cash Tracker and Stripe. It matches each recorded payment to the real Stripe
          charge and flags mismatches — amount differences, refunds you haven’t recorded, charges in Stripe with no Cash
          Tracker row, and vice-versa.
        </P>
        <P>
          Verdicts run from <B>MATCHED</B> (exact / within fee tolerance) through <B>AMOUNT MISMATCH</B>,
          <B> REFUND UNRECORDED</B>, <B>NO STRIPE CHARGE</B>, and <B>STRIPE ONLY</B>. It never writes anything — it only reads.
        </P>
      </>
    ),
  },
  {
    id: "health",
    icon: "🩺",
    title: "Data Health — the fix-it list",
    body: (
      <>
        <P>
          At the bottom of the page. It scans every source for problems that quietly distort your numbers and gives a
          step-by-step fix for each: the exact system, database/sheet, how to find the record, and what to change. Hover
          <B> How to fix ⓘ</B> for the full instruction.
        </P>
        <List>
          <li>
            <B>EMPTY ROW</B> — a blank Notion row with only a Cohort tag; it inflates counts until you fill it in or delete it.
          </li>
          <li>
            <B>COHORT NAME</B> — the Cohort text isn’t a clean launch name (auto-cleared if the Google Sheet already agrees).
          </li>
          <li>
            <B>TAG ≠ WINDOW</B> — the launch tag disagrees with the enrollment date (the “Javid” case).
          </li>
          <li>
            <B>CASH &gt; REVENUE</B>, <B>$0 DEAL</B>, <B>OWES + NO DATE</B>, <B>DUPLICATE…</B> — arithmetic and duplicate checks.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "trust",
    icon: "✅",
    title: "Why you can trust the numbers",
    body: (
      <>
        <List>
          <li>
            <B>Unique people vs money</B>: people-counts are always deduped by email (one buyer with three payments = one
            person). Money-totals sum every payment.
          </li>
          <li>
            <B>Test records</B> (email <code>systems@joinotherside.com</code> or a name starting “king test”) are hidden by
            default — toggle <B>Include test records</B> to show them.
          </li>
          <li>
            <B>Unparseable money</B> is never silently turned into $0 — it’s flagged in Data Health so you notice it.
          </li>
          <li>
            <B>Refresh</B> pulls everything live; data is cached ~2 minutes to stay fast. Hit the refresh button to force-pull.
          </li>
        </List>
      </>
    ),
  },
];

export default function GuideTab() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ start: true, dates: true }));
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div
        style={{
          background: "var(--glass-bg)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          border: "1px solid var(--chrome-hi)",
          borderRadius: 16,
          padding: "26px 28px",
          marginBottom: 18,
          boxShadow: "var(--shadow-card)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(120% 100% at 0% 0%, rgba(16,185,129,0.10), transparent 60%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <div style={{ fontSize: 12, letterSpacing: 0.1, textTransform: "uppercase", color: "var(--accent)", fontWeight: 600 }}>
            Field guide
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "6px 0 8px", color: "var(--text)", letterSpacing: "-0.02em" }}>
            How to read this dashboard
          </h1>
          <p style={{ margin: 0, color: "var(--text-dim)", fontSize: 14, lineHeight: 1.6, maxWidth: 620 }}>
            Everything, A–Z — what each tab shows, how every number is calculated, and how to trust it. Written for the team, no
            jargon. Tap a section to expand.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {SECTIONS.map((s) => {
          const isOpen = !!open[s.id];
          return (
            <div
              key={s.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <button
                onClick={() => toggle(s.id)}
                style={{
                  all: "unset",
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  cursor: "pointer",
                  padding: "14px 18px",
                }}
              >
                <span style={{ fontSize: 18, lineHeight: 1 }}>{s.icon}</span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{s.title}</span>
                <span style={{ color: "var(--muted)", fontSize: 13, transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}>
                  ▸
                </span>
              </button>
              {isOpen && <div style={{ padding: "0 18px 16px 48px" }}>{s.body}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
