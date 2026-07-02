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

## Notion access — two paths, they coexist

The dashboard supports **two ways** to authenticate to Notion, and both can be configured at the same time. Whichever the current viewer has, wins:

| Path | Who authorizes | What it needs | Best for |
|---|---|---|---|
| **A. Workspace token** (`NOTION_TOKEN`) | Workspace admin, once | Admin adds an internal integration to the pages | Everyone-shares-one-service-account model |
| **B. Per-user OAuth** ("Connect my Notion account" button) | Each viewer, once | Public integration + OAuth client ID/secret | Members without admin access, or if permissions should follow the viewer |

**Which does the dashboard use?** OAuth cookie always wins. If a user hasn't connected their own account, the dashboard falls back to `NOTION_TOKEN`. If neither is set, Notion tabs show a clear "connect required" state.

## Setup

### 1. (Option A) Workspace-scoped internal integration

1. Go to [notion.so/profile/integrations](https://notion.so/profile/integrations) and create a new **internal integration**.
2. Under capabilities, enable:
   - **Read content**
   - **Read user information without email** — this is required for the Sales Activity tab to resolve the "Enr Manager" person field into closer names.
3. Copy the integration's secret token — this is your `NOTION_TOKEN`.

### 2. (Option A) Connect the integration to the parent page

Open the **Execution System** page in Notion (the ancestor page containing all 4 databases), click **•••** → **Connections** → add your integration. Confirm "add to sub-pages" so it cascades to all 4 databases in one shot.

### 3. (Option B) Public integration + OAuth (recommended for members without admin access)

This adds a **"Connect my Notion account"** button to the dashboard. Each viewer authorizes with their own Notion account and only sees data their account has permission to see. No shared token needed, easy to disconnect anytime.

1. Go to [notion.so/profile/integrations](https://notion.so/profile/integrations) → **New integration** → set type to **Public**.
2. Fill in name, workspace, and — critically — set the **Redirect URI** to `https://<your-vercel-domain>/api/notion/callback` (e.g. `https://otherside-ewfc.vercel.app/api/notion/callback`).
3. Under Capabilities: enable **Read content** and **Read user information without email**.
4. Copy the **OAuth client ID** and **OAuth client secret**.
5. Add to Vercel env vars: `NOTION_OAUTH_CLIENT_ID`, `NOTION_OAUTH_CLIENT_SECRET`. Redirect URI is auto-derived from the request host, so `NOTION_OAUTH_REDIRECT_URI` is optional.

Then, in the dashboard, click **Connect my Notion account** in the Notion Access panel. Notion asks which pages to grant, you select **Execution System**, land back on the dashboard — all 4 tabs populate.

To disconnect: click **Disconnect** in the same panel. The OAuth cookie is deleted; the dashboard falls back to the workspace token (if set).

### 4. Share the Google Sheet

Open the Challenge Master Cash Tracker sheet, click **Share**, and set general access to **Anyone with the link can view**. The dashboard reads it via the CSV export endpoint, so no API key is required — but it will fail with a clear error if the sheet is not publicly viewable (it detects and rejects Google's HTML login page instead of silently parsing it as data).

### 5. Configure environment variables

Copy `.env.example` to `.env.local` and fill in. Both auth paths can coexist:

```
# Option A — workspace-scoped internal integration (optional if using OAuth)
NOTION_TOKEN=secret_...

# Option B — Public integration for per-user OAuth (optional if using token)
NOTION_OAUTH_CLIENT_ID=
NOTION_OAUTH_CLIENT_SECRET=
NOTION_OAUTH_REDIRECT_URI=     # optional; auto-derived from request host

DASHBOARD_PASSWORD=            # optional — leave blank to disable the login wall
CHALLENGE_SHEET_ID=1mJ3DLye8otnjs2CbUganWGNQbciBssZFHEFusoGQFpc
CHALLENGE_SHEET_GID=0
```

### 6. Run locally

```
npm install
npm run dev
```

### 7. Deploy to Vercel

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
