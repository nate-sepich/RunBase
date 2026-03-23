#!/usr/bin/env node
/**
 * RunBase HR Backfill Script
 *
 * One-time script: iterates all existing activities in runs.json that are
 * missing splits_standard[] and fetches the full detail from Strava to add
 * per-mile HR data. Respects Strava rate limits (100 req/15min).
 *
 * Usage:
 *   STRAVA_CLIENT_ID=xxx STRAVA_CLIENT_SECRET=yyy STRAVA_REFRESH_TOKEN=zzz \
 *     node scripts/backfill-hr.js
 *
 * Options:
 *   --dry-run    Print what would be updated without writing
 *   --force      Re-fetch all activities, even those with existing splits
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data/runs.json');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

// Strava rate limit: 100 requests per 15 minutes.
// We add a 700ms delay between calls to stay well under the burst limit.
const RATE_LIMIT_DELAY_MS = 700;

const {
  STRAVA_CLIENT_ID,
  STRAVA_CLIENT_SECRET,
  STRAVA_REFRESH_TOKEN,
} = process.env;

const required = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`[backfill] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

async function fetchDetailedActivity(accessToken, activityId) {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (res.status === 429) throw new Error('Rate limited — wait 15 minutes and retry');
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${await res.text()}`);
  return res.json();
}

function extractSplits(detail) {
  if (!detail.splits_standard?.length) return null;
  return detail.splits_standard.map((s, i) => {
    const split = {
      mile: i + 1,
      moving_time_seconds: s.moving_time,
      average_speed_meters_per_second: s.average_speed,
    };
    if (s.average_heartrate != null) split.average_heartrate = Math.round(s.average_heartrate);
    return split;
  });
}

async function main() {
  console.log(`[backfill] Starting HR backfill${DRY_RUN ? ' (DRY RUN)' : ''}${FORCE ? ' (FORCE)' : ''}...`);

  const store = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const activities = store.activities;

  const toUpdate = FORCE
    ? activities
    : activities.filter(a => !a.splits_standard);

  console.log(`[backfill] ${toUpdate.length} of ${activities.length} activities need splits`);

  if (toUpdate.length === 0) {
    console.log('[backfill] Nothing to do. All activities already have HR splits.');
    return;
  }

  console.log('[backfill] Refreshing Strava token...');
  const { access_token } = await refreshAccessToken();

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const activity of toUpdate) {
    process.stdout.write(`[backfill] ${activity.date.slice(0,10)} — ${activity.name} (${activity.id})... `);

    try {
      await sleep(RATE_LIMIT_DELAY_MS);
      const detail = await fetchDetailedActivity(access_token, activity.id);
      const splits = extractSplits(detail);

      if (!splits) {
        console.log('no splits available (Strava returned none)');
        skipped++;
        continue;
      }

      const hasHr = splits.some(s => s.average_heartrate != null);
      if (!hasHr) {
        console.log(`${splits.length} mile splits, no HR data`);
      } else {
        const hrValues = splits.filter(s => s.average_heartrate).map(s => s.average_heartrate);
        console.log(`${splits.length} splits, HR: ${Math.min(...hrValues)}–${Math.max(...hrValues)} bpm`);
      }

      if (!DRY_RUN) {
        const idx = activities.findIndex(a => a.id === activity.id);
        if (idx >= 0) {
          activities[idx].splits_standard = splits;
          // Also backfill avg/max HR at activity level if missing
          if (!activities[idx].average_heartrate && detail.average_heartrate) {
            activities[idx].average_heartrate = Math.round(detail.average_heartrate);
          }
          if (!activities[idx].max_heartrate && detail.max_heartrate) {
            activities[idx].max_heartrate = detail.max_heartrate;
          }
        }
      }
      updated++;
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failed++;
      if (err.message.includes('Rate limited')) {
        console.error('[backfill] Hit rate limit — stopping. Re-run in 15 minutes.');
        break;
      }
    }
  }

  if (!DRY_RUN && updated > 0) {
    store.last_updated = new Date().toISOString();
    fs.writeFileSync(DATA_PATH, JSON.stringify(store, null, 2));
    console.log(`\n[backfill] Written to runs.json`);
  }

  console.log(`\n[backfill] Done.`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped (no Strava splits): ${skipped}`);
  console.log(`  Failed:  ${failed}`);
}

main().catch(err => {
  console.error('[backfill] Fatal:', err);
  process.exit(1);
});
