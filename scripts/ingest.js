#!/usr/bin/env node
/**
 * RunBase ETL Ingestion Script
 *
 * Fetches recent Strava activities (last 7 days), maps them to the runs.json
 * schema, deduplicates by Strava ID, and writes back to data/runs.json.
 *
 * Auth: Uses refresh_token grant to get a short-lived access token.
 * Token rotation: If Strava returns a new refresh_token, it writes it back
 * to the repo's GitHub Actions secret via the gh CLI (requires REPO_PAT secret).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data/runs.json');

const {
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_REFRESH_TOKEN,
  REPO_PAT,
  GITHUB_REPOSITORY,
} = process.env;

// --- Validation ---

const required = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[ingest] Missing required env var: ${key}`);
    process.exit(1);
  }
}

// --- Strava Auth ---

async function refreshAccessToken() {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: STRAVA_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Strava token refresh failed (${res.status}): ${body}`);
  }

  return res.json();
}

async function rotateRefreshToken(newToken) {
  if (!REPO_PAT || !GITHUB_REPOSITORY) {
    console.warn('[ingest] REPO_PAT or GITHUB_REPOSITORY not set — skipping token rotation');
    console.warn('[ingest] New refresh token (store manually):', newToken);
    return;
  }

  try {
    execSync(
      `gh secret set STRAVA_REFRESH_TOKEN --body "${newToken}" --repo ${GITHUB_REPOSITORY}`,
      { env: { ...process.env, GH_TOKEN: REPO_PAT }, stdio: 'pipe' }
    );
    console.log('[ingest] Refresh token rotated successfully');
  } catch (err) {
    console.warn('[ingest] Token rotation failed (non-fatal):', err.message);
  }
}

// --- Strava API ---

async function fetchRecentActivities(accessToken) {
  const after = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
  const res = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch activities (${res.status}): ${body}`);
  }

  return res.json();
}

async function fetchDetailedActivity(accessToken, activityId) {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch activity ${activityId} (${res.status}): ${body}`);
  }

  return res.json();
}

// --- Classification ---

/**
 * Strava workout_type mapping:
 *   0 = default run (exclude)
 *   1 = race (exclude — we use event date-matching instead)
 *   2 = long run
 *   3 = workout
 *
 * Race override: if activity date matches an upcoming_event within ±1 day.
 */
function classifyType(workoutType, activityDate, upcomingEvents) {
  const actDate = new Date(activityDate);

  for (const event of upcomingEvents) {
    const eventDate = new Date(event.date);
    const diffDays = Math.abs((actDate - eventDate) / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) return 'race';
  }

  // null/0 = untagged default run → treat as workout
  const typeMap = { 2: 'long_run', 3: 'workout' };
  return typeMap[workoutType] ?? 'workout';
}

// --- PR Detection ---

const STANDARD_DISTANCES = [
  { meters: 400, label: '400m' },
  { meters: 804.67, label: '1/2 mile' },
  { meters: 1000, label: '1k' },
  { meters: 1609.34, label: '1 mile' },
  { meters: 3218.69, label: '2 mile' },
  { meters: 5000, label: '5k' },
  { meters: 10000, label: '10k' },
  { meters: 15000, label: '15k' },
  { meters: 16093.4, label: '10 mile' },
  { meters: 20000, label: '20k' },
  { meters: 21097.5, label: 'Half Marathon' },
  { meters: 30000, label: '30k' },
  { meters: 42195, label: 'Marathon' },
];

function detectPR(bestEfforts) {
  if (!bestEfforts?.length) return { is_pr: false, pr_distance: null };

  const prEfforts = bestEfforts.filter(e => e.pr_rank === 1);
  if (!prEfforts.length) return { is_pr: false, pr_distance: null };

  // Pick the most significant PR (longest distance)
  const best = prEfforts.reduce((a, b) => (a.distance > b.distance ? a : b));

  const match = STANDARD_DISTANCES.find(d => Math.abs(d.meters - best.distance) < 50);
  const pr_distance = match
    ? match.label
    : `${(best.distance / 1000).toFixed(1)}k`;

  return { is_pr: true, pr_distance, pr_time_seconds: best.elapsed_time };
}

// --- Mapping ---

function mapActivity(detail, upcomingEvents) {
  const type = classifyType(detail.workout_type, detail.start_date, upcomingEvents);
  if (!type) return null;

  const { is_pr, pr_distance, pr_time_seconds } = detectPR(detail.best_efforts);

  const activity = {
    id: String(detail.id),
    date: detail.start_date,
    type,
    name: detail.name,
    distance_meters: detail.distance,
    moving_time_seconds: detail.moving_time,
    total_elevation_gain_meters: detail.total_elevation_gain,
    average_speed_meters_per_second: detail.average_speed,
    is_pr,
  };

  if (detail.max_heartrate != null) activity.max_heartrate = detail.max_heartrate;
  if (detail.average_heartrate != null) activity.average_heartrate = Math.round(detail.average_heartrate);
  if (pr_distance) activity.pr_distance = pr_distance;
  if (pr_time_seconds) activity.pr_time_seconds = pr_time_seconds;

  // Per-mile splits for HR zone breakdown
  if (detail.splits_standard?.length) {
    activity.splits_standard = detail.splits_standard.map((s, i) => {
      const split = {
        mile: i + 1,
        moving_time_seconds: s.moving_time,
        average_speed_meters_per_second: s.average_speed,
      };
      if (s.average_heartrate != null) split.average_heartrate = Math.round(s.average_heartrate);
      return split;
    });
  }

  return activity;
}

// --- Main ---

async function main() {
  console.log('[ingest] Starting RunBase ETL...');

  // 1. Auth
  console.log('[ingest] Refreshing Strava access token...');
  const { access_token, refresh_token: newRefreshToken } = await refreshAccessToken();

  // 2. Rotate if changed
  if (newRefreshToken && newRefreshToken !== STRAVA_REFRESH_TOKEN) {
    await rotateRefreshToken(newRefreshToken);
  }

  // 3. Load store
  const store = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

  // 4. Fetch recent summaries
  console.log('[ingest] Fetching activities from last 7 days...');
  const summaries = await fetchRecentActivities(access_token);
  const runs = summaries.filter(a => a.sport_type === 'Run' || a.type === 'Run');
  console.log(`[ingest] Found ${runs.length} run(s)`);

  // 5. Process each run
  const updatedActivities = [...store.activities];

  for (const summary of runs) {
    console.log(`[ingest] Processing: ${summary.name} (${summary.id})`);
    try {
      const detail = await fetchDetailedActivity(access_token, summary.id);
      const mapped = mapActivity(detail, store.upcoming_events);

      if (!mapped) {
        console.log(`  -> Skipped (workout_type ${detail.workout_type} not classifiable)`);
        continue;
      }

      const idx = updatedActivities.findIndex(a => a.id === mapped.id);
      if (idx >= 0) {
        updatedActivities[idx] = mapped;
        console.log(`  -> Updated (${mapped.type})`);
      } else {
        updatedActivities.push(mapped);
        console.log(`  -> Appended (${mapped.type})`);
      }
    } catch (err) {
      // Non-fatal: log and continue so one bad activity doesn't abort the run
      console.error(`  -> Error: ${err.message}`);
    }
  }

  // 6. Sort descending by date
  updatedActivities.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 7. Write back
  const updated = {
    ...store,
    last_updated: new Date().toISOString(),
    activities: updatedActivities,
  };

  fs.writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2));
  console.log(`[ingest] Done. Total activities: ${updatedActivities.length}`);
}

main().catch(err => {
  console.error('[ingest] Fatal error:', err);
  process.exit(1);
});
