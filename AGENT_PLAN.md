# RunBase MVP — Agent Execution Plan

## Context

Full project scaffold is complete. All source files exist and are logically correct.
The subsequent agent must validate, wire up, test, and deploy the project end-to-end.

## Project Overview

- **Stack**: Astro 4 (static) + Tailwind CSS, hosted on GitHub Pages
- **Data**: `data/runs.json` — committed to repo, built at static-gen time
- **ETL**: `scripts/ingest.js` — Node 20, runs via GitHub Actions every 12h
- **Auth**: Strava OAuth with self-rotating refresh token via `gh secret set`

---

## Step 1: Install & Verify Build

```bash
npm install
npm run build
```

- Fix any TypeScript or Astro build errors
- Astro reads `data/runs.json` at build time via static import — confirm this resolves correctly
- If JSON import doesn't resolve, switch to `fs.readFileSync` in a `.ts` data file and import that instead
- Confirm `dist/` is generated with `index.html`, `prs/index.html`, `horizon/index.html`

---

## Step 2: Configure GitHub Pages

In `astro.config.mjs`, set:
```js
site: 'https://YOUR_GITHUB_USERNAME.github.io',
base: '/RunBase',  // or '/' if this is a user/org page
```

All internal `href` links in components use relative paths — verify they work with the `base` prefix.

---

## Step 3: Configure GitHub Actions

In the repo settings (must be done by the human or via `gh` CLI):

1. **Enable GitHub Pages**: Settings → Pages → Source → GitHub Actions
2. **Add secrets**: Settings → Secrets → Actions:
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_REFRESH_TOKEN` (obtain via `npm run oauth`)
   - `REPO_PAT` *(optional)* — a GitHub Fine-Grained PAT with "Secrets: Read and Write" permission on this repo, enables auto-rotation of the Strava refresh token

**To get the initial STRAVA_REFRESH_TOKEN:**
```bash
STRAVA_CLIENT_ID=xxx STRAVA_CLIENT_SECRET=yyy npm run oauth
```
This opens a browser, completes OAuth, and prints the token to stdout.

---

## Step 4: Seed `data/runs.json` with Real Data

Once secrets are set, trigger the ETL manually:
- GitHub Actions → RunBase ETL → Run workflow

Or run locally:
```bash
STRAVA_CLIENT_ID=xxx STRAVA_CLIENT_SECRET=yyy STRAVA_REFRESH_TOKEN=zzz npm run ingest
```

Verify `data/runs.json` is updated with real activities.

---

## Step 5: Validate ETL Logic

Check these behaviors in `scripts/ingest.js`:

### Activity type classification
- `workout_type: 2` → `long_run`
- `workout_type: 3` → `workout`
- `workout_type: 0` or `1` → excluded (unless date-matched to event)
- Activity date within ±1 day of an `upcoming_events[].date` → `race`

### PR detection
- `best_efforts[].pr_rank === 1` → `is_pr: true`
- Longest distance PR is used for `pr_distance` label
- Standard distance labels are matched within 50m tolerance

### Idempotency test
Run the ingest script twice in a row — the `activities` array length must not grow.

---

## Step 6: Validate Frontend

Run `npm run dev` and verify:

### Timeline (`/`)
- Activities listed in reverse chronological order
- Distance in miles (not meters)
- Pace displayed as MM:SS/mi
- Duration as H:MM:SS or M:SS
- Type badge (Workout / Long Run / Race) with correct color
- PR badge appears when `is_pr: true`
- Heart rate rows only appear when data exists
- Summary stats (total miles, activity count, PR count) are accurate

### PR Board (`/prs`)
- Only shows `is_pr: true` activities
- Deduplicated by `pr_distance` (one card per distance, most recent)
- Sorted: Marathon → 30k → Half → ... → 400m

### Horizon (`/horizon`)
- Upcoming events sorted ascending (soonest first)
- Past events sorted descending below
- Countdown "14d", "Today" shown for close/current events
- Empty state message shown when `upcoming_events: []`

---

## Step 7: Add Seed Events (Optional but Recommended for Demo)

Add a sample entry to `data/runs.json` under `upcoming_events` to test the Horizon view:

```json
{
  "event_name": "Example 10k",
  "date": "2026-06-01T07:00:00Z",
  "location": "City, State",
  "target_distance": "10k",
  "a_goal": "Sub-45:00",
  "b_goal": "Sub-48:00"
}
```

---

## Step 8: Push & Deploy

```bash
git add -A
git commit -m "feat: initial RunBase MVP scaffold"
git push origin main
```

GitHub Actions will build and deploy automatically. Verify the Pages URL is live.

---

## Known Edge Cases to Handle

| Issue | Fix |
|---|---|
| Astro can't statically import JSON | Use `fs.readFileSync` in a `.ts` data loader, export typed object |
| `gh secret set` fails in Actions | Ensure `REPO_PAT` has `secrets: write` scope; falls back gracefully |
| Strava rate limit (100 requests/15min) | Ingest script processes runs sequentially with per-activity error handling; already non-fatal |
| `workout_type` missing on activity | Default to `null` (exclude) — handled in `classifyType` |
| Race classification false positive | The ±1 day window may misclassify — consider tightening to ±0 (same UTC day) if needed |
| Google Fonts CORS on Pages | Replace with system font stack if load fails |

---

## File Map

```
RunBase/
├── .github/workflows/etl.yml     — GitHub Actions: ingest → build → deploy
├── scripts/
│   ├── ingest.js                 — ETL: Strava fetch, map, deduplicate, write
│   └── oauth-setup.js            — One-time OAuth helper (run locally)
├── data/runs.json                — The data lake (committed to repo)
├── src/
│   ├── lib/
│   │   ├── format.ts             — Imperial unit conversions, formatters
│   │   └── types.ts              — TypeScript interfaces
│   ├── layouts/Layout.astro      — Base layout: nav, footer
│   ├── components/
│   │   ├── ActivityCard.astro    — Single activity card (Timeline)
│   │   ├── PRCard.astro          — PR highlight card
│   │   └── EventCard.astro       — Upcoming event card
│   └── pages/
│       ├── index.astro           — Timeline view
│       ├── prs.astro             — PR Board view
│       └── horizon.astro         — Horizon (events) view
├── astro.config.mjs              — TODO: set site + base for GH Pages
├── tailwind.config.mjs
└── package.json
```
