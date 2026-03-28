#!/usr/bin/env node
/**
 * RunBase Daily Brief Generator
 *
 * Generates today's training brief from shared repo logic.
 * Can either print the message (dry-run) or send it via Telegram.
 *
 * Usage:
 *   node scripts/daily-brief.js --dry-run
 *   TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... node scripts/daily-brief.js
 */

import { generateDailyBrief } from '../src/lib/server/dailyBrief.js';
import { sendTelegramMessage } from '../src/lib/server/telegram.js';

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '-5176531716';

async function main() {
  console.log('[brief] Generating daily brief...');

  const { message, session } = await generateDailyBrief();

  console.log('[brief] Message generated:');
  console.log('---');
  console.log(message);
  console.log('---');

  if (DRY_RUN) {
    console.log('[brief] DRY RUN — message not sent');
    return;
  }

  const result = await sendTelegramMessage({
    botToken: TELEGRAM_BOT_TOKEN,
    chatId: TELEGRAM_CHAT_ID,
    text: message,
  });

  console.log('[brief] ✅ Brief sent via Telegram');
  console.log(`[brief] Telegram message id: ${result.message_id}`);
  if (session) {
    console.log(`[brief] Session type: ${session.type}`);
  }
}

main().catch((error) => {
  console.error('[brief] Fatal error:', error.message || error);
  process.exit(1);
});
