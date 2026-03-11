# RunBase

A zero-infrastructure running portfolio. Strava data ingested automatically, stored as JSON, rendered as a static site on GitHub Pages.

---

## Architecture

```
Strava API  →  ingest.js  →  data/runs.json  →  Astro build  →  GitHub Pages
                  ↑
           GitHub Actions
           (every 12 hours)
```

**No database. No server. No ORM.** The entire backend is a committed JSON file and a cron job.

### Data Flow

1. GitHub Actions triggers `scripts/ingest.js` every 12 hours (or on demand)
2. The script exchanges the Strava refresh token for a short-lived access token
3. Activities from the last 7 days are fetched and mapped to the schema
4. `data/runs.json` is updated via deduplication (upsert by Strava activity ID)
5. The updated file is committed to `main`
6. A second job builds the Astro site and deploys to GitHub Pages

### Unit Conversion Architecture

**The data store is metric. The display layer is imperial.**

`data/runs.json` stores raw values exactly as Strava returns them:

| Field | Stored As | Why |
|---|---|---|
| `distance_meters` | meters (float) | Strava native |
| `moving_time_seconds` | seconds (int) | Strava native |
| `average_speed_meters_per_second` | m/s (float) | Strava native |
| `total_elevation_gain_meters` | meters (float) | Strava native |

All conversion to imperial happens at **render time only** via `src/lib/format.ts`:

| Function | Input | Output |
|---|---|---|
| `metersToMiles(m)` | meters | miles (2dp) |
| `pacePerMile(mps)` | m/s | `"MM:SS"` per mile |
| `formatDuration(s)` | seconds | `"H:MM:SS"` or `"M:SS"` |
| `metersToFeet(m)` | meters | feet (rounded) |

**Why keep metric in the store?** Storing raw Strava values means the ETL is a pure mapping with zero conversion loss. If units ever need to change (e.g., a future athlete on metric), only `format.ts` changes — the data is untouched.

---

## Views

| Route | Description |
|---|---|
| `/` | **Timeline** — all activities in reverse chronological order |
| `/prs` | **PR Board** — personal records, deduplicated per standard distance |
| `/horizon` | **Horizon** — upcoming races with A/B goals |

---

## Activity Classification

Strava's `workout_type` field drives classification:

| Strava `workout_type` | RunBase type |
|---|---|
| `3` | `workout` |
| `2` | `long_run` |
| `0` or `1` | Excluded |
| Any, if date matches an `upcoming_events` entry (±1 day) | `race` |

Default runs (`workout_type: 0`) are excluded. Tag runs correctly in Strava.

---

## PR Detection

PRs are detected automatically from Strava's `best_efforts` data on each activity. If any effort has `pr_rank: 1`, the activity is flagged as a PR. The longest PR distance on the activity is used as the `pr_distance` label.

Standard distances recognized: 400m, 1/2 mile, 1k, 1 mile, 2 mile, 5k, 10k, 15k, 10 mile, 20k, Half Marathon, 30k, Marathon.

---

## Setup

### 1. Get a Strava API application

Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app. Set the callback domain to `localhost`.

### 2. Run the OAuth setup (once per athlete)

```bash
STRAVA_CLIENT_ID=xxx STRAVA_CLIENT_SECRET=yyy npm run oauth
```

This opens a browser, completes the OAuth flow, and prints the three secrets to add to your repo.

### 3. Add GitHub repository secrets

Settings → Secrets and variables → Actions:

| Secret | Required | Description |
|---|---|---|
| `STRAVA_CLIENT_ID` | Yes | From your Strava API app |
| `STRAVA_CLIENT_SECRET` | Yes | From your Strava API app |
| `STRAVA_REFRESH_TOKEN` | Yes | From `npm run oauth` |
| `REPO_PAT` | Optional | GitHub fine-grained PAT with **Secrets: Read & Write** on this repo — enables automatic token rotation |

### 4. Enable GitHub Pages

Settings → Pages → Source → **GitHub Actions**

### 5. Configure the site URL

In `astro.config.mjs`:

```js
site: 'https://YOUR_USERNAME.github.io',
base: '/RunBase',  // or '/' if using a custom domain or user/org page
```

### 6. Trigger the first ETL run

GitHub Actions → RunBase ETL → Run workflow

Or run locally:
```bash
STRAVA_CLIENT_ID=xxx STRAVA_CLIENT_SECRET=yyy STRAVA_REFRESH_TOKEN=zzz npm run ingest
```

---

## Adding Upcoming Events

Events are manually maintained in `data/runs.json` under `upcoming_events`:

```json
{
  "event_name": "Boston Marathon",
  "date": "2026-04-20T10:00:00Z",
  "location": "Boston, MA",
  "target_distance": "Marathon",
  "a_goal": "Sub-3:00",
  "b_goal": "Sub-3:15"
}
```

Any activity recorded within ±1 day of an event's `date` will be automatically classified as `type: "race"`.

---

## Token Rotation

Strava refresh tokens rotate on use. Each ETL run:

1. Exchanges the current refresh token for a new access token
2. Receives a new refresh token from Strava
3. If `REPO_PAT` is set, writes the new refresh token back to the `STRAVA_REFRESH_TOKEN` GitHub secret automatically

Without `REPO_PAT`, the token is logged to the Actions run output and must be manually updated. Strava tokens do not expire by time, only by rotation — so manual rotation is viable but not recommended for long-running deployments.

---

## Local Development

```bash
npm install
npm run dev       # dev server at localhost:4321
npm run build     # static build to dist/
npm run preview   # preview the build
```
