# Otherside Command Center — Role-Relevant Extension: Proposal

> Status: **PROPOSAL — nothing here is built yet.** This maps how the role layer,
> operating/metrics split, gated commissions, and the refund/adjustment model fit
> onto the app that already exists. Where a Notion/Sheet change is needed, the
> exact additive schema is listed for you to verify **before** any code is written.

---

## 1. What exists today (so we extend, not rebuild)

- **Auth:** one shared site password (`DASHBOARD_PASSWORD`) → SHA-256 → httpOnly
  cookie, enforced in `middleware.ts`. **One role. Everyone sees every tab.**
- **Tabs:** Overview, Insights, Reborn Cash, Payments, Appointments, Applications,
  Sales Activity, Challenge, Reconciliation, Guide.
- **Data layer:** `/api/dashboard` pulls 4 Notion DBs + the Challenge Google Sheet,
  server-cached, into one `DashboardPayload`. Every tab reads from that one payload.
- **Drill-downs:** bars/cards → full underlying list (with search). **Preserve.**
- **No NPS tile and no referral tile exist today** — so "replace NPS with referral"
  is really "add a referral tile" (nothing to remove).
- Recent fixes this cycle: Sales money now reads correctly, cash date now reads
  "Payment Date", Outstanding removed, schema-health guard added.

**Design principle we're committing to (founder's words): "too much info is no
info."** Each role sees only its slice. Two lenses on the same data, kept distinct:
- **Operating lens** = *act* (who owes their next payment, who to chase).
- **Metrics lens** = *understand* (PIF vs plan vs open, close rates, adoption).

---

## 2. Architecture decision — roles as a *lens*, not new pages

The Notion "Testimonial Tracker" pattern = **one data layer, many role views.** We
mirror that exactly. We do **not** fork the data or duplicate tabs per person.

**Proposed:** a single **role selector** (driven by who's logged in — see §6) that
curates *which existing tabs and which cards within them* each role sees, and labels
each card **Operating** or **Metrics**. One payload, filtered presentation.

```
DashboardPayload (unchanged)
   └─ RoleView(role)  ← new, pure presentation layer
        ├─ tabs allowed for this role
        └─ per tab: cards allowed, tagged Operating | Metrics
```

Why this over alternatives:
- **vs. separate dashboards per role:** no data duplication, no drift, drill-downs
  keep working untouched. One source of truth.
- **vs. a giant permissions matrix in every component:** the role config lives in
  ONE file (`lib/roles.ts`), so adding Setter later is a config edit, not a refactor.

### Proposed Role → View matrix (draft — confirm/adjust)

| Role | Sees | Lens emphasis |
|---|---|---|
| **VA** (Jen/Rochelle) | Overview (curated), Appointments, Challenge (+ Telegram adoption), Payment-plan & Deposit **operating** lists | Operating first |
| **Closer** | Own close rate, own funnel, own commissions (gated), own booked/showed/offers/sales | Metrics + own commissions |
| **EM (Adeyemi)** | EM view = pipeline/enrollment ops (separate from his closer view) | Operating |
| **Ops** (2 people) | Reborn Cash operating (plans due, deposits owed, deferrals), Reconciliation, Data Health | Operating |
| **Oliver** | Everything (full) + commissions + adjustments rollups | Both |
| **Setter** (if added) | Setting activity: booked, show-rate on their sets | Metrics |

Plus the **Challenge → Role drill** the founder described: inside Challenge, a role
chip (e.g. "VA") that filters the Challenge view down to just that role's slice.

---

## 3. The refund / adjustment model (the important one)

**Problem today (three problems, one root cause):** the cash tracker logs *every
transaction as a new line*, so (a) revenue inflates as installments land, (b)
refunds were handled by *deleting rows* ("no bueno" — founder), and (c) plan-changes
(12k→10k, plan→PIF) leave a stale figure. All three are the same missing concept: a
**non-destructive record of change over time.**

### Recommended: a separate **Adjustments Ledger** (new Notion DB), NOT columns on the row

Original revenue & cash rows stay **100% intact**. Every change is a **separate,
dated, signed** entry that rolls up:

```
net revenue = Σ(original revenue)  + Σ(adjustment revenue Δ)
net cash    = Σ(original cash)      + Σ(adjustment cash Δ)
gross | refunded | net  ← all three shown, never overwritten
```

Proposed new DB **"Reborn Adjustments"** (additive — needs your OK on names):

| Property | Type | Purpose |
|---|---|---|
| `Client` | relation → Reborn Cash Tracker (or `Client Email` text) | who |
| `Type` | select: `Refund` · `Plan Change` · `Deferral` · `Comp` · `Correction` | what kind |
| `Revenue Delta` | number ($) — signed (e.g. −9000) | effect on booked revenue |
| `Cash Delta` | number ($) — signed (e.g. −4000) | effect on cash collected |
| `Date` | date | when it happened (drives dated rollups) |
| `Reason` | text | audit note |
| `Recorded By` | person | who processed it |

This one structure solves **refunds** (negative deltas on the refund date),
**plan-changes** (a `Plan Change` delta for the 2k difference), **deferrals**
(a `Deferral` entry; sale still counts for its launch, cash carries), and the
**"every transaction inflates revenue"** problem (net = originals + adjustments,
computed, never a hand-edited figure).

**Alternative considered (simpler, weaker):** refund columns *on the cash row*
(`Refunded?`, `Refund Revenue`, `Refund Cash`). Fine for a single refund, but it
can't hold a *history* (a plan-change **then** a later refund), can't be dated
independently, and re-introduces hand-editing the client line. **Not recommended**,
but it's a valid MVP if you want the smallest possible Notion change first.

> This ledger is the backbone the commissions and deposit/plan views also read from,
> so getting it right unlocks several outcomes at once.

---

## 4. Deposit / payment-plan / PIF tracking

Two lenses, same data:
- **Operating:** "who's on a plan and what's due" (name + next payment date + amount),
  "who paid a deposit and still owes", "who deferred". Actionable lists, drill-down.
- **Metrics:** of buyers — **% PIF vs % plan vs % open**, deposit conversion.
- **Filter:** PIF / Plan / Deposit / Deferred toggle across the list (Rochelle's ask).

Reads existing fields now (`Product`, `Payment Plan`, `Date of Next Payment`), and
gets **accurate** once the additive flags below exist.

---

## 5. Referral tile & Telegram adoption

- **Referral tile (replaces NPS intent):** *actual* referrals made, target **30%**.
  Needs a source of truth for "who referred": proposed additive `Referred By (email)`
  on the client record. Rate = distinct referrers ÷ clients. (No NPS score — measure
  what they *did*, not what they *said*.)
- **Telegram adoption:** attribution from inside Telegram is **impossible** (links in
  Telegram don't tie to email — only Kit emails tag). So we do **not** build on
  Telegram clicks. Instead: a **manual `Telegram Adopted` flag** in the Erupt sheet
  (+ optional `Telegram Username` for disambiguating same-name people, per Jen) → an
  **adoption-rate** metric card + an operating list of "not yet adopted → email them."

---

## 6. Commissions & access control (needs your decision)

Commission data must be **access-restricted to closers / Jen / Oliver**, and must
**react to refunds/changes** (a refund reverses/claws back its commission).

**A plain client-side password on a tab is not adequate** (founder agrees) — hiding a
tab still ships the numbers to the browser. So gate at the **API + route** layer.

Auth options (pick one — see the question at the end):

| Option | What it is | Pros | Cons |
|---|---|---|---|
| **B. Per-user sessions + roles (recommended)** | Each person gets their own login; a signed httpOnly session carries their `role`; middleware + the dashboard API enforce it. No new external service. | Fits the existing cookie/middleware pattern; server-enforced; fast to ship; commissions never sent to non-finance roles | We manage a small user list (hashed pw + role), stored in env/Notion/KV |
| **C. Auth.js (NextAuth) credentials/Google** | Drop-in auth library, optional Google SSO | Battle-tested sessions, easy Google login later | Heavier dependency; more than we need today |
| **A. Second password on the commissions tab** | Prompt a 2nd password client-side | Trivial | **Rejected** — not real security, numbers still shipped |

**Recommendation: B now**, with a clean path to C if you later want Google SSO.
Commission is **computed in-dashboard** from `sale + rate rule + adjustments` (so a
refund auto-reverses it) rather than stored as a frozen number.

---

## 7. Exact properties each feature READS (verify names — trailing spaces are real)

**Reborn Cash Tracker** (`collection://367c…`): `Name`, `Email`, `Cash Collected`,
`Revenue`, `Balance`(formula), `Cohort`, `Product`, `Payment Plan`, `Payment Method`,
`Payment Date`, `Date of Next Payment`, `Coupon Code`, `Note`, **`Enr Manager `**
(trailing space).
**Appointments** (`368c…`): `Name`, `Email`, `Appointment Time`, `Appointment Status`,
`Appointment Type`, `Cohort`, **`Enr Manager `**, `Phone`, `Notes`, `Created`.
**Applications** (`33ec…`): `First Name`, `Last Name`, `Email`, `Phone`,
`Application Status`, `What is your current level of annual earnings in USD?`,
`Date Created`, **`Cohort `** (trailing space), `Enrollment Date`(rollup),
`Product`(rollup), `REBORN Payments Tracker`(relation).
**Sales Activity** (`04af…`): `Entry`, `Date`, **`Enr Manager`** (person, *no* trailing
space here), `Launch`, `New Calls in Calendar`, `Showed to Call`, `Offers Made`,
`Sales Made`, `Cash Collected on Call`, `Sales in Revenue`, `Paid in Full Sold`,
`Payment Plans Sold`, `No Show`, `Cancelled Calls`, `Rescheduled`.

### UPDATE — adjustments live on the **Master REBORN CRM**, not the cash tracker

Seeing your **Master REBORN CRM** (`collection://0ec6324f…`) changes the answer for
the better. It is already **one row per (Customer Email + Product)**, links the many
payment rows from the Reborn Cash Tracker, and rolls up `Total Cash Collected`,
`Payment Count`, `Enrollment Date`, `Last Payment Date` — with a **manual**
`Total Revenue` (you noted revenue changes sometimes). **That per-client row is the
right home for adjustments** — the per-transaction cash tracker stays untouched.

**Add these columns to the Master REBORN CRM** (exact names — verify, then I build):

| Property | Type | Notes |
|---|---|---|
| `Refunded Cash` | Number ($) | cash given back (cumulative) |
| `Refunded Revenue` | Number ($) | deal value reversed (cumulative) |
| `Adjustment Type` | Select: `Refund` · `Plan Change` · `Deferral` · `Comp` · `Correction` | what happened |
| `Adjustment Date` | Date | when |
| `Adjustment Note` | Text | reason / history |
| `Deposit Paid?` | Checkbox | deposit tracking |
| `Program Deferral?` | Checkbox | carried to next cohort |
| `Referred By (Email)` | Email | referral source |
| `Net Revenue` | Formula | `prop("Total Revenue") - prop("Refunded Revenue")` |
| `Net Cash` | Formula | `prop("Total Cash Collected") - prop("Refunded Cash")` |

Originals (`Total Revenue`, `Total Cash Collected`) are never overwritten; the
counters sit beside them and the formulas show gross vs net. This is what your team
described in the call (counter columns), and it's maintainable at one row per client.

**Counters vs. ledger:** the counters above hold the *cumulative* adjustment per
client — perfect for the common case (a refund, or a plan-change reflected by editing
`Total Revenue` + a note). If you later need a **dated history of multiple events on
the same client** (plan-change *then* a refund), we add the separate `Reborn
Adjustments` DB (§3) related to this CRM row. Recommendation: **start with the
counters** (you asked where to put columns — this is it), add the ledger only if the
multi-event case becomes common.

- **Erupt Google Sheet** additions: `Telegram Adopted` (checkbox/TRUE-FALSE),
  `Telegram Username` (text).
- **Commissions**: prefer *computed* (rate rule + adjustments) over a stored column;
  if stored, `Commission Amount` + `Commission Status` on the client record —
  pending your rules.

### Dashboard side (after you add the columns)

The dashboard will read the **Master REBORN CRM** as a per-client source (one row per
client) to power the operating + metrics views: payment-plan/deposit/deferral lists,
PIF vs plan vs open, refunds, and **gross / refunded / net** revenue. The Notion
integration must be shared with this DB (it already relates to the others). I'll build
the source adapter to read the exact property names above once you confirm them.

---

## 8. Phased, additive build plan

- **Phase 0 — safe now, zero Notion changes:** role-lens scaffolding (`lib/roles.ts`
  + role selector), operating/metrics tagging on existing cards, **per-closer close
  rate at a glance** (data already correct after the Sales fix), PIF/plan/open
  metrics from existing fields (best-effort). Drill-downs preserved.
- **Phase 1 — after you verify schema:** Adjustments Ledger + gross/refunded/net
  rollups; deposit/deferral operating lists; Telegram adoption card + chase list;
  referral tile.
- **Phase 2 — after auth decision:** per-user role auth; **gated** commissions view
  (API-enforced) that reacts to adjustments.
- **Phase 3 — after Webflow output confirmed:** plan-amount parser tolerant of both
  the current Notion product strings and the new Webflow format.

---

## 9. Confirmations I need from you

1. **Auth approach** — B (per-user roles, recommended) / C (NextAuth) / other? And
   the user→role list (VA, Closer(s), EM, Ops×2, Oliver, Setter) + where to store it.
2. **Adjustments model** — approve the separate **Reborn Adjustments** ledger
   (recommended) vs. refund-columns-on-the-row MVP? Confirm the exact property names.
3. **Commission rules** — rate %, PIF vs plan handling, refund clawback behaviour, and
   **who sees what** (closers see *only their own* vs. all closers).
4. **Referral** — add `Referred By` to which DB, and the 30% denominator (challenge
   registrants? reborn clients?).
5. **Additive flags** — OK to add `Deposit Paid`, `Program Deferral` (Cash Tracker)
   and `Telegram Adopted`, `Telegram Username` (Erupt sheet)? Confirm names.
6. **Webflow** (Phase 3) — the confirmed product-name output once checkout moves, so
   the parser tolerates both formats.

**I can start Phase 0 immediately** (no Notion changes, fully reversible) while you
verify the schema for Phases 1–3.
