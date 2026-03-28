#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_PATH = path.join(__dirname, '../data/runs.json');

const activityId = process.env.ACTIVITY_ID || process.argv.find(arg => arg.startsWith('--activity='))?.split('=')[1];
const replyText = process.env.REPLY_TEXT || process.argv.find(arg => arg.startsWith('--reply='))?.split('=').slice(1).join('=');

if (!activityId || !replyText) {
  console.error('Usage: node scripts/apply-post-run-reply.js --activity=<id> --reply="text"');
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(RUNS_PATH, 'utf8'));
const activity = store.activities.find(a => a.id === activityId);

if (!activity) {
  console.error(`[post-run-reply] Activity not found: ${activityId}`);
  process.exit(1);
}

activity.post_run = activity.post_run || {};
activity.post_run.reflection = {
  ...(activity.post_run.reflection || {}),
  reply_text: replyText,
  reply_received_at: new Date().toISOString(),
};

fs.writeFileSync(RUNS_PATH, JSON.stringify(store, null, 2) + '\n');
console.log(`[post-run-reply] Saved reply for activity ${activityId}`);
