#!/usr/bin/env node
/**
 * RunBase Historical Backfill
 *
 * Fetches ALL Strava run history and upserts into data/runs.json.
 * Safe to run multiple times — deduplicates by activity ID.
 *
 * Usage:
 *   node scripts/backfill.js                  # full history
 *   node scripts/backfill.js --retry          # only retry previously failed IDs
 *   node scripts/backfill.js --from=2024-01-01
 *   node scripts/backfill.js --dry-run
 *
 * On 429: automatically waits out the 15-minute rate limit window and retries.
 * Progress: writes runs.json after every successful fetch.
 * Failed IDs: saved to data/backfill-failed.json for --retry.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data/runs.json');
const FAILED_PATH = path.join(__dirname, '../data/backfill-failed.json');

const { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } = process.env;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RETRY_MODE = args.includes('--retry');
const fromArg = args.find(a => a.startsWith('--from='));
const FROM_DATE = fromArg ? Math.floor(new Date(fromArg.split('=')[1]).getTime() / 1000) : null;

const DETAIL_DELAY_MS = 800;
const RATE_LIMIT_WAIT_MS = 15 * 60 * 1000; // 15 minutes

// --- Validation ---

for (const key of ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN']) {
  if (!process.env[key]) {
    console.error(`[backfill] Missing required env var: ${key}`);
    process.exit(1);
  }
}

// --- Helpers ---

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function writeStore(store, activities) {
  if (DRY_RUN) return;
  const sorted = [...activities].sort((a, b) => new Date(b.date) - new Date(a.date));
  fs.writeFileSync(DATA_PATH, JSON.stringify({ ...store, last_updated: new Date().toISOString(), activities: sorted }, null, 2));
}

function saveFailedIds(ids) {
  if (DRY_RUN || ids.size === 0) return;
  fs.writeFileSync(FAILED_PATH, JSON.stringify([...ids], null, 2));
}

// --- Auth ---

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
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  return res.json();
}

// --- Strava API ---

async function fetchAllActivitySummaries(accessToken) {
  const summaries = [];
  let page = 1;
  console.log('[backfill] Fetching activity list...');

  while (true) {
    const params = new URLSearchParams({
      per_page: '200',
      page: String(page),
      ...(FROM_DATE ? { after: String(FROM_DATE) } : {}),
    });

    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) throw new Error(`Failed to fetch page ${page} (${res.status}): ${await res.text()}`);

    const data = await res.json();
    if (data.length === 0) break;

    const runs = data.filter(a => a.sport_type === 'Run' || a.type === 'Run');
    summaries.push(...runs);
    console.log(`[backfill]   Page ${page}: ${data.length} activities, ${runs.length} runs`);

    if (data.length < 200) break;
    page++;
  }

  return summaries;
}

async function fetchDetailWithRetry(accessToken, activityId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (res.ok) return res.json();

    if (res.status === 429) {
      if (attempt === maxRetries) throw new Error(`Rate limited after ${maxRetries} attempts`);
      const waitMin = 15;
      console.log(`\n[backfill] Rate limited (429). Waiting ${waitMin} minutes before retry ${attempt + 1}/${maxRetries}...`);
      // Countdown
      for (let remaining = waitMin * 60; remaining > 0; remaining -= 10) {
        process.stdout.write(`\r[backfill] Resuming in ${Math.ceil(remaining / 60)}m ${remaining % 60}s...  `);
        await sleep(Math.min(10000, remaining * 1000));
      }
      process.stdout.write('\n');
      continue;
    }

    throw new Error(`Failed to fetch activity ${activityId} (${res.status})`);
  }
}

// --- Classification ---

function classifyType(workoutType, activityDate, upcomingEvents) {
  const actDate = new Date(activityDate);
  for (const event of upcomingEvents) {
    const diffDays = Math.abs((actDate - new Date(event.date)) / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) return 'race';
  }
  const typeMap = { 2: 'long_run', 3: 'workout' };
  return typeMap[workoutType] ?? 'workout';
}

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
  const best = prEfforts.reduce((a, b) => (a.distance > b.distance ? a : b));
  const match = STANDARD_DISTANCES.find(d => Math.abs(d.meters - best.distance) < 50);
  return { is_pr: true, pr_distance: match ? match.label : `${(best.distance / 1000).toFixed(1)}k`, pr_time_seconds: best.elapsed_time };
}

function mapActivity(detail, upcomingEvents) {
  const { is_pr, pr_distance, pr_time_seconds } = detectPR(detail.best_efforts);
  const activity = {
    id: String(detail.id),
    date: detail.start_date,
    type: classifyType(detail.workout_type, detail.start_date, upcomingEvents),
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
  return activity;
}

// --- Main ---

async function main() {
  console.log(`[backfill] Starting${DRY_RUN ? ' (DRY RUN)' : ''}${RETRY_MODE ? ' (RETRY mode)' : ''}${FROM_DATE ? ` from ${fromArg.split('=')[1]}` : ''}...`);

  const { access_token } = await refreshAccessToken();
  const store = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const activities = [...store.activities];
  const failedIds = new Set();

  let summaries;

  if (RETRY_MODE) {
    if (!fs.existsSync(FAILED_PATH)) {
      console.log('[backfill] No backfill-failed.json found. Nothing to retry.');
      return;
    }
    const failedList = JSON.parse(fs.readFileSync(FAILED_PATH, 'utf8'));
    summaries = failedList.map(id => ({ id, name: `activity ${id}` }));
    console.log(`[backfill] Retrying ${summaries.length} previously failed activities...`);
  } else {
    summaries = await fetchAllActivitySummaries(access_token);
    console.log(`[backfill] Found ${summaries.length} total runs to process`);
  }

  if (summaries.length === 0) {
    console.log('[backfill] Nothing to do.');
    return;
  }

  let added = 0, updated = 0, failed = 0;

  for (let i = 0; i < summaries.length; i++) {
    const summary = summaries[i];
    process.stdout.write(`[backfill] (${i + 1}/${summaries.length}) ${summary.name}... `);

    try {
      const detail = await fetchDetailWithRetry(access_token, summary.id);
      const mapped = mapActivity(detail, store.upcoming_events);

      const idx = activities.findIndex(a => a.id === mapped.id);
      if (idx >= 0) {
        activities[idx] = mapped;
        process.stdout.write(`updated (${mapped.type})\n`);
        updated++;
      } else {
        activities.push(mapped);
        process.stdout.write(`added (${mapped.type})\n`);
        added++;
      }

      // Write after every successful fetch
      writeStore(store, activities);

    } catch (err) {
      process.stdout.write(`FAILED: ${err.message}\n`);
      failedIds.add(String(summary.id));
      failed++;
    }

    if (i < summaries.length - 1) await sleep(DETAIL_DELAY_MS);
  }

  saveFailedIds(failedIds);

  console.log(`\n[backfill] Complete. Added: ${added}, Updated: ${updated}, Failed: ${failed}`);
  console.log(`[backfill] Total activities in store: ${activities.length}`);
  if (failedIds.size > 0) {
    console.log(`[backfill] ${failedIds.size} failed IDs saved to data/backfill-failed.json`);
    console.log('[backfill] Run with --retry to attempt them again after the rate limit resets.');
  }
  if (DRY_RUN) console.log('[backfill] Dry run — runs.json not modified.');
}

main().catch(err => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
