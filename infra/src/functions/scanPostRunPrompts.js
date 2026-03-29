import { matchPlannedSession, summarizeAdherence, buildReflectionPrompt } from '../../../src/lib/server/postRun.js';
import { sendTelegramMessage } from '../../../src/lib/server/telegram.js';
import { fetchRepoJson } from '../shared/runbaseRepoData.js';
import { getPromptStateByRun, markPromptSent, markPromptSyncStatus } from '../shared/messagingState.js';
import { syncPromptToRunsJson } from '../shared/repoSync.js';

const DEFAULT_RECENT_ACTIVITY_WINDOW_HOURS = 36;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function parseRecentActivityWindowHours() {
  const raw = process.env.POST_RUN_RECENT_WINDOW_HOURS;
  if (!raw) return DEFAULT_RECENT_ACTIVITY_WINDOW_HOURS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid POST_RUN_RECENT_WINDOW_HOURS: ${raw}`);
  }

  return parsed;
}

function getActivityTimestamp(activity) {
  const candidates = [
    activity?.start_date,
    activity?.start_date_local,
    activity?.date,
    activity?.post_run?.reflection?.prompt_sent_at,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function isRecentEligibleActivity(activity, now, recentWindowHours) {
  const activityTimestamp = getActivityTimestamp(activity);
  if (!activityTimestamp) {
    return false;
  }

  const ageMs = now.getTime() - activityTimestamp.getTime();
  if (ageMs < 0) {
    return false;
  }

  return ageMs <= recentWindowHours * 60 * 60 * 1000;
}

export const handler = async () => {
  const stage = process.env.STAGE || 'dev';
  const chatId = requireEnv('TELEGRAM_CHAT_ID');
  const botToken = requireEnv('TELEGRAM_BOT_TOKEN');
  const recentWindowHours = parseRecentActivityWindowHours();
  const now = new Date();

  const [trainingPlan, runStore] = await Promise.all([
    fetchRepoJson('training-plan.json'),
    fetchRepoJson('runs.json'),
  ]);

  const activities = Array.isArray(runStore.activities) ? runStore.activities : [];

  for (const activity of activities) {
    if (activity.post_run?.reflection?.prompt_sent_at) {
      continue;
    }

    if (!isRecentEligibleActivity(activity, now, recentWindowHours)) {
      continue;
    }

    const existing = await getPromptStateByRun(activity.id);
    if (existing) {
      continue;
    }

    const matchedPlan = matchPlannedSession(trainingPlan, activity);
    const adherence = summarizeAdherence(activity, matchedPlan);
    const prompt = buildReflectionPrompt(activity, matchedPlan, adherence);

    const telegramResult = await sendTelegramMessage({
      botToken,
      chatId,
      text: prompt,
    });

    const promptSentAt = now.toISOString();

    await markPromptSent({
      activityId: activity.id,
      chatId,
      telegramMessageId: telegramResult.message_id,
      promptText: prompt,
      promptSentAt,
      matchedPlan,
      adherence,
      stage,
    });

    let promptSyncStatus = 'skipped';
    try {
      await syncPromptToRunsJson({
        activityId: activity.id,
        promptText: prompt,
        promptSentAt,
        chatId,
        matchedPlan,
        adherence,
      });
      promptSyncStatus = 'synced';
      await markPromptSyncStatus({ activityId: activity.id, status: 'synced', syncedAt: new Date().toISOString() });
    } catch (error) {
      promptSyncStatus = 'pending';
      console.error('[scanPostRunPrompts] runs.json prompt sync failed', error);
      await markPromptSyncStatus({
        activityId: activity.id,
        status: 'pending',
        errorMessage: error.message || String(error),
      });
    }

    return {
      ok: true,
      stage,
      activityId: activity.id,
      telegramMessageId: telegramResult.message_id,
      status: adherence.status,
      promptSyncStatus,
      recentWindowHours,
    };
  }

  return {
    ok: true,
    stage,
    skipped: true,
    reason: 'no eligible recent activity found',
    recentWindowHours,
  };
};
