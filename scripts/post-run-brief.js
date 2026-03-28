#!/usr/bin/env node

import { preparePostRunPrompt, saveRunStore } from '../src/lib/server/postRun.js';

const TELEGRAM_CHAT_ID = process.env.RUNBASE_TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '-5176531716';
const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const ACTIVITY_ID = process.env.ACTIVITY_ID || process.argv.find((arg) => arg.startsWith('--activity='))?.split('=')[1];

async function main() {
  const prepared = preparePostRunPrompt({
    activityId: ACTIVITY_ID,
    target: TELEGRAM_CHAT_ID,
    now: new Date(),
  });

  if (!prepared) {
    console.log('[post-run] No eligible activity found');
    return;
  }

  if (!DRY_RUN) {
    saveRunStore(prepared.store);
  }

  console.log('[post-run] Prepared prompt for activity', prepared.activity.id);
  console.log('---');
  console.log(prepared.prompt);
  console.log('---');
  console.log('[post-run] OpenClaw handoff:');
  console.log(JSON.stringify(prepared.handoff, null, 2));

  if (DRY_RUN) {
    console.log('[post-run] DRY RUN only — no state written and no outbound message sent');
    return;
  }

  console.log('[post-run] Ready for Telegram delivery to', TELEGRAM_CHAT_ID);
}

main().catch((error) => {
  console.error('[post-run] Fatal error:', error.message || error);
  process.exit(1);
});
