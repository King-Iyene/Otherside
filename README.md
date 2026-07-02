# Otherside Command Center

Live business dashboard for Otherside, pulling directly from Notion and a Google Sheet. Built with Next.js 14 (App Router), TypeScript, and recharts.

## Tabs

- **Overview** — cross-source KPI summary (cash, appointments, applications, sales activity)
- **Cash** — Reborn Cash Tracker
- **Appointments** — Appointments Tracker
- **Applications** — REBORN Application Tracker
- **Sales Activity** — Sales Activity Tracker Daily Inputs, with a period-scoped leaderboard
- **Challenge** — Challenge Master Cash Tracker (Google Sheet)

Each tab has date range presets, dimension filters, search, KPI cards, a time-series chart (day/week/month), a breakdown chart, and a sortable table capped at 200 rows with "show all."

## Setup

### 1. Create a Notion integration

1. Go to [notion.so/profile/integrations](https://notion.so/profile/integrations) and create a new **internal integration**.
2. Under capabilities, enable:
   - **Read content**
   - **Read user information without email** — this is required for the Sales Activity tab to resolve the "Enr Manager" person field into closer names.
3. Copy the integration's secret token — this is your `NOTION_TOKEN`.

### 2. Connect the integration to each database

For each of the following databases, open it in Notion, click **•••** in the top-right corner, go to **Connections**, and add your integration:

- Reborn Cash Tracker
- Appointments Tracker
- REBORN Application Tracker
- Sales Activity Tracker Daily Inputs

### 3. Share the Google Sheet

Open the Challenge Master Cash Tracker sheet, click **Share**, and set general access to **Anyone with the link can view**. The dashboard reads it via the CSV export endpoint, so no API key is required — but it will fail with a clear error if the sheet is not publicly viewable (it detects and rejects Google's HTML login page instead of silently parsing it as data).

### 4. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NOTION_TOKEN=secret_...
DASHBOARD_PASSWORD=            # optional — leave blank to disable the login wall
CHALLENGE_SHEET_ID=1mJ3DLye8otnjs2CbUganWGNQbciBssZFHEFusoGQFpc
CHALLENGE_SHEET_GID=0
```

### 5. Run locally

```
npm install
npm run dev
```

### 6. Deploy to Vercel

1. Import the repo into Vercel.
2. Add the same environment variables in **Project Settings → Environment Variables**.
3. Deploy.

`NOTION_TOKEN` is only ever read on the server (API route + source adapters) — it is never sent to the browser.

## Notes on data handling

- Server responses are cached in-memory for 2 minutes with inflight request deduplication. Append `?fresh=1` to `/api/dashboard` (or hit the pulse bar's Refresh button) to bypass the cache.
- Each of the 5 data sources is fetched and error-isolated independently — if one fails, its tab shows an error banner while the rest of the dashboard keeps working.
- Money fields are parsed defensively: unparseable values (e.g. `"Merged"`, `"$5k"`) are treated as `null`, never coerced to `0`, and are flagged as red "INVALID" badges in tables plus listed in the Data Health panel at the bottom of the page.
- Records with email `systems@joinotherside.com` or a name starting with "king test" are flagged as test records — hidden by default, toggle "Include test records" in any tab's controls to show them.
- Notion pagination pauses 350ms between pages and retries up to 5 times on 429/529, honoring `Retry-After` when present.
- Week bucketing uses the Monday of the ISO week.

## Optional password gate

Set `DASHBOARD_PASSWORD` to require a password before viewing the dashboard. Leave it unset to disable auth entirely (no login page, no redirect). The password is never stored — the server hashes it with SHA-256 and compares that hash against a cookie set on successful login.
