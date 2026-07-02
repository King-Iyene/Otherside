# Otherside Command Center

A live dashboard over the Reborn Notion trackers and the Challenge Master Cash Tracker Google Sheet. Built with Next.js, deploys on Vercel's free tier.

**Data sources (already wired in, verified against the live schemas):**

| Tab | Source | ID |
|---|---|---|
| Cash | Reborn Cash Tracker (Notion) | `367c2386-6468-80af-bbe1-d5f6d2510876` |
| Appointments | Appointments Tracker (Notion) | `368c2386-6468-803e-8fac-fe68a4ed8a6a` |
| Applications | REBORN Application Tracker (Notion) | `33ec2386-6468-8004-b411-d9243b1f17e5` |
| Sales Activity | Sales Activity Tracker Daily Inputs (Notion) | `25ac2fe5-3b3e-450b-bf9f-4a485cf6a410` |
| Challenge | Challenge Master Cash Tracker (Google Sheet) | set via `CHALLENGE_SHEET_ID` |

Data refreshes automatically every 2 minutes; the Refresh button pulls up-to-the-second numbers on demand.

---

## Setup, A to Z

### Step 1 — Create the Notion integration (one time, ~3 minutes)

1. Open **https://www.notion.so/profile/integrations** while logged into the Otherside workspace. *(Screenshot: integrations page)*
2. Click **New integration**.
3. Name: `Otherside Dashboard`. Associated workspace: the Otherside workspace. Type: **Internal**.
4. Click **Save**, then open the integration you just created.
5. Under **Capabilities**:
   - **Read content** must be ON. Update/insert can stay OFF — the dashboard only reads.
   - Under **User capabilities**, select **Read user information without email**. This is required for closer names to appear on the Sales Activity tab (the Enr Manager field there is a Person field). *(Screenshot: capabilities panel)*
6. Copy the **Internal Integration Secret** (starts with `ntn_` or `secret_`). This is your `NOTION_TOKEN`. Treat it like a password.

### Step 2 — Connect the integration to the four databases

The integration can only see databases it has been explicitly connected to. Do this for **each** of the four:

1. Open the database as a full page in Notion:
   - Reborn Cash Tracker
   - Appointments Tracker
   - REBORN Application Tracker
   - Sales Activity Tracker Daily Inputs (open the **Closer Sales Tracker** page, then open the Daily Inputs database as a full page)
2. Click the **•••** menu (top right) → **Connections** → **Connect to** → pick **Otherside Dashboard**. *(Screenshot: connections menu)*
3. Notion asks to confirm access for the page and its children — confirm.

Tip: connecting the integration to a shared parent page (for example the Reborn Offer Playbook area) covers every database under it in one step.

### Step 3 — Make the Google Sheet readable

The Challenge tab reads the sheet through its CSV export link, which requires link-view access:

1. Open the Challenge Master Cash Tracker sheet.
2. Click **Share** → under General access choose **Anyone with the link** → **Viewer**. *(Screenshot: share dialog)*
3. Confirm the sheet ID in the URL matches `CHALLENGE_SHEET_ID` in your environment variables: it is the long string between `/d/` and `/edit`.
4. If the data lives on a tab other than the first one, copy the number after `#gid=` in the URL into `CHALLENGE_SHEET_GID`.

If the sheet must stay private, leave it as is — the tab will show a clear "not connected" notice and everything else keeps working. We can switch it to a service-account connection later.

### Step 4 — Put the code on GitHub

1. Create a new **private** repository on GitHub, e.g. `otherside-dashboard`.
2. From this project folder:
   ```bash
   git init
   git add .
   git commit -m "Otherside command center dashboard"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/otherside-dashboard.git
   git push -u origin main
   ```

### Step 5 — Deploy on Vercel

1. Go to **https://vercel.com/new**, sign in with GitHub, and import the repository.
2. Framework preset: Next.js is detected automatically. Leave build settings as-is.
3. Before clicking Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `NOTION_TOKEN` | the secret from Step 1 |
   | `DASHBOARD_PASSWORD` | any password the team will share (leave blank for open access) |
   | `CHALLENGE_SHEET_ID` | `1mJ3DLye8otnjs2CbUganWGNQbciBssZFHEFusoGQFpc` |
   | `CHALLENGE_SHEET_GID` | `0` (or the tab's gid) |

4. Click **Deploy**. Your dashboard will be live at `https://your-project.vercel.app` in about a minute.
5. Optional: add a custom domain (e.g. `dashboard.joinotherside.com`) under Project → Settings → Domains. That requires a DNS record, so loop Tim in before adding it.

### Step 6 — Verify before sharing upstream

On first load, cross-check the pulse-bar totals (Cash collected, Revenue booked) against the Notion Cash Tracker's own column sums. Open the **Data health** panel — it lists every row with an unreadable money value or missing date so nothing is silently wrong. Fix flagged rows in Notion, hit Refresh, and confirm the flags clear.

---

## How it behaves

- **Test records** (`systems@joinotherside.com` / "King Test") are excluded from all numbers by default, with a visible toggle to include them.
- **Unparseable money values** are never treated as $0 — they show as red badges in tables and are listed in Data health.
- **One source failing never blanks the dashboard** — the other tabs keep working and a banner explains what failed.
- **Rate limits**: Notion allows ~3 requests/second per integration. The 2-minute cache plus paced pagination keeps usage far below that even with the whole team on the dashboard.
- **Leaderboard**: recomputed live from daily inputs inside whatever date range you pick, so weekly and monthly standings work (Notion's own rollups are all-time only).
- **Definitions used** (mirroring the tracker's own formulas): Show % = Showed ÷ New Calls · Offer % = Offers ÷ Showed · Close % (Shows) = Sales ÷ Showed · Close % (Offers) = Sales ÷ Offers. Appointments "Showed" = Showed, Client Won, Finisher, Awaiting Payment, Deposit Collected, Purchased Agreement Not Signed.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in NOTION_TOKEN
npm run dev                  # http://localhost:3000
```
