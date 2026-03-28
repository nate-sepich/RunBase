import { generateDailyBrief } from '../../../src/lib/server/dailyBrief.js';
import { sendTelegramMessage } from '../../../src/lib/server/telegram.js';
import { fetchRepoJson } from '../shared/runbaseRepoData.js';
import { getDailyBriefState, markDailyBriefSent } from '../shared/messagingState.js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export const handler = async () => {
  const stage = process.env.STAGE || 'dev';
  const chatId = requireEnv('TELEGRAM_CHAT_ID');
  const botToken = requireEnv('TELEGRAM_BOT_TOKEN');
  const today = new Date().toISOString().slice(0, 10);

  const existing = await getDailyBriefState({ stage, date: today });
  if (existing) {
    return {
      ok: true,
      skipped: true,
      reason: 'daily brief already sent',
      date: today,
      stage,
    };
  }

  const [trainingPlan, athleteConfig] = await Promise.all([
    fetchRepoJson('training-plan.json'),
    fetchRepoJson('athlete.json'),
  ]);

  const { message, session } = await generateDailyBrief({ trainingPlan, athleteConfig, now: new Date() });
  const telegramResult = await sendTelegramMessage({
    botToken,
    chatId,
    text: message,
  });

  await markDailyBriefSent({
    stage,
    date: today,
    chatId,
    telegramMessageId: telegramResult.message_id,
    sessionType: session?.type ?? null,
    messageText: message,
    sentAt: new Date().toISOString(),
  });

  return {
    ok: true,
    stage,
    date: today,
    telegramMessageId: telegramResult.message_id,
    sessionType: session?.type ?? null,
  };
};
