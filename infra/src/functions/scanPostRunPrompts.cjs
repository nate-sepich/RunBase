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
  if (!activityTimestamp) return false;

  const ageMs = now.getTime() - activityTimestamp.getTime();
  if (ageMs < 0) return false;

  return ageMs <= recentWindowHours * 60 * 60 * 1000;
}

function metersToMiles(meters) {
  return Math.round(meters * 0.000621371 * 100) / 100;
}

function pacePerMile(speedMetersPerSecond) {
  if (!speedMetersPerSecond || speedMetersPerSecond <= 0) return '--:--';
  const secondsPerMile = 1609.34 / speedMetersPerSecond;
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function getPlanStart(trainingPlan) {
  return new Date(`${trainingPlan.plan_start}T00:00:00Z`);
}

function getWeekStart(trainingPlan, weekNum) {
  const date = new Date(getPlanStart(trainingPlan));
  date.setUTCDate(date.getUTCDate() + (weekNum - 1) * 7);
  return date;
}

function getSessionDate(trainingPlan, weekNum, dayName) {
  const weekStart = getWeekStart(trainingPlan, weekNum);
  const targetDay = DAYS.indexOf(dayName);
  const startDay = weekStart.getUTCDay();
  let diff = targetDay - startDay;
  if (diff < 0) diff += 7;
  const date = new Date(weekStart);
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function matchPlannedSession(trainingPlan, activity) {
  const actIso = activity.date.slice(0, 10);

  for (const week of trainingPlan.weeks) {
    for (const session of week.sessions) {
      const sessionDate = getSessionDate(trainingPlan, week.week, session.day);
      const sessionIso = isoDate(sessionDate);
      const diffDays = Math.abs((new Date(actIso).getTime() - new Date(sessionIso).getTime()) / 86400000);
      if (diffDays > 1) continue;

      if (!session.distance_miles) {
        if (session.type === 'rest' || session.type === 'cross' || session.type === 'flex') continue;
        return { week: week.week, theme: week.theme, date: sessionIso, session };
      }

      const actualMiles = metersToMiles(activity.distance_meters);
      const distanceDelta = Math.abs(actualMiles - session.distance_miles) / session.distance_miles;
      if (distanceDelta <= 0.25) {
        return { week: week.week, theme: week.theme, date: sessionIso, session };
      }
    }
  }

  return null;
}

function summarizeAdherence(activity, matchedPlan) {
  const actualMiles = metersToMiles(activity.distance_meters);
  const actualPace = pacePerMile(activity.average_speed_meters_per_second);

  if (!matchedPlan) {
    return {
      status: 'off_plan',
      summary: `Unplanned ${actualMiles} mile ${activity.type.replace('_', ' ')}. Still counts — worth logging how it felt.`,
      actual_distance_miles: actualMiles,
      actual_pace_per_mile: actualPace,
    };
  }

  const { session } = matchedPlan;
  const plannedMiles = session.distance_miles;
  const typeMatch =
    session.type === activity.type ||
    (session.type === 'easy' && activity.type === 'workout') ||
    (session.type === 'tempo' && activity.type === 'workout');

  const distanceMatch =
    plannedMiles == null || plannedMiles === 0
      ? true
      : Math.abs(actualMiles - plannedMiles) / plannedMiles <= 0.2;

  if (typeMatch && distanceMatch) {
    return {
      status: 'matched',
      summary: `Plan called for ${session.type.replace('_', ' ')} and this landed pretty close to target.`,
      actual_distance_miles: actualMiles,
      actual_pace_per_mile: actualPace,
    };
  }

  if (distanceMatch || typeMatch) {
    return {
      status: 'modified',
      summary: `Close to the planned ${session.type.replace('_', ' ')}, but with a slight detour from the original target.`,
      actual_distance_miles: actualMiles,
      actual_pace_per_mile: actualPace,
    };
  }

  return {
    status: 'off_plan',
    summary: `This looked meaningfully different from the planned ${session.type.replace('_', ' ')} session.`,
    actual_distance_miles: actualMiles,
    actual_pace_per_mile: actualPace,
  };
}

function buildReflectionPrompt(activity, matchedPlan, adherence) {
  const runLabel = `${metersToMiles(activity.distance_meters)} mi at ${pacePerMile(activity.average_speed_meters_per_second)}/mi`;

  if (!matchedPlan) {
    return [
      `Nice work, Gabe. I saw a new run come through: ${runLabel}.`,
      `This one didn't map cleanly to the current plan, which is totally fine. ${adherence.summary}`,
      `How'd it feel? Anything worth noting — legs, wind, energy, sickness, or anything else?`,
    ].join('\n\n');
  }

  const session = matchedPlan.session;
  const plannedBits = [session.type.replace('_', ' ')];
  if (session.distance_miles) plannedBits.push(`${session.distance_miles} mi`);
  if (session.pace_target) plannedBits.push(session.pace_target);

  return [
    `Nice one, Gabe. New run logged: ${runLabel}.`,
    `Plan check: today called for ${plannedBits.join(' · ')}. ${adherence.summary}`,
    `How'd it feel out there? Any context you want saved with the run — tired legs, wind, got sick, felt great, whatever?`,
  ].join('\n\n');
}

async function sendTelegramMessage({ botToken, chatId, text, disableWebPagePreview = true }) {
  if (!botToken) throw new Error('Missing TELEGRAM_BOT_TOKEN');
  if (!chatId) throw new Error('Missing TELEGRAM_CHAT_ID');

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: disableWebPagePreview,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description || `Telegram API failed: ${response.status}`);
  }

  return payload.result;
}

const DEFAULT_DATA_BASE_URL = 'https://raw.githubusercontent.com/nate-sepich/RunBase/main/data';

function getRunbaseDataBaseUrl() {
  return process.env.RUNBASE_DATA_BASE_URL || DEFAULT_DATA_BASE_URL;
}

async function fetchRepoJson(fileName) {
  const baseUrl = getRunbaseDataBaseUrl().replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/${fileName}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
  }
  return response.json();
}

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(client);

function tableName() {
  const value = process.env.MESSAGING_STATE_TABLE;
  if (!value) throw new Error('Missing MESSAGING_STATE_TABLE');
  return value;
}

async function getPromptStateByRun(activityId) {
  const command = new GetCommand({
    TableName: tableName(),
    Key: {
      pk: `RUN#${activityId}`,
      sk: 'PROMPT',
    },
  });

  const result = await doc.send(command);
  return result.Item ?? null;
}

async function markPromptSent({ activityId, chatId, telegramMessageId, promptText, promptSentAt, matchedPlan, adherence, stage }) {
  await doc.send(new PutCommand({
    TableName: tableName(),
    Item: {
      pk: `RUN#${activityId}`,
      sk: 'PROMPT',
      entityType: 'runPrompt',
      activityId,
      stage,
      chatId,
      telegramMessageId,
      promptText,
      promptSentAt,
      matchedPlan,
      adherence,
    },
  }));

  await doc.send(new PutCommand({
    TableName: tableName(),
    Item: {
      pk: `TG#${chatId}#${telegramMessageId}`,
      sk: 'PROMPT',
      entityType: 'telegramPromptIndex',
      activityId,
      stage,
      chatId,
      telegramMessageId,
      promptSentAt,
    },
  }));
}

async function markPromptSyncStatus({ activityId, status, syncedAt = null, errorMessage = null }) {
  const command = new UpdateCommand({
    TableName: tableName(),
    Key: {
      pk: `RUN#${activityId}`,
      sk: 'PROMPT',
    },
    UpdateExpression: 'SET promptSyncStatus = :status, promptSyncedAt = :syncedAt, promptSyncError = :errorMessage',
    ExpressionAttributeValues: {
      ':status': status,
      ':syncedAt': syncedAt,
      ':errorMessage': errorMessage,
    },
  });

  await doc.send(command);
}

function githubConfig() {
  return {
    token: requireEnv('RUNBASE_GITHUB_WRITE_TOKEN'),
    repository: process.env.RUNBASE_GITHUB_REPOSITORY || 'nate-sepich/RunBase',
    branch: process.env.RUNBASE_GITHUB_BRANCH || 'main',
    runsPath: process.env.RUNBASE_GITHUB_RUNS_PATH || 'data/runs.json',
  };
}

async function githubRequest(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'runbase-automation',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function getRunsJsonFromRepo() {
  const { token, repository, branch, runsPath } = githubConfig();
  const encodedPath = encodeURIComponent(runsPath).replace(/%2F/g, '/');
  const response = await githubRequest(`/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`, { token });
  const decoded = Buffer.from(response.content, 'base64').toString('utf8');

  return {
    token,
    repository,
    branch,
    runsPath,
    sha: response.sha,
    store: JSON.parse(decoded),
  };
}

async function putRunsJsonToRepo({ token, repository, branch, runsPath, sha, store, message }) {
  const encodedPath = encodeURIComponent(runsPath).replace(/%2F/g, '/');
  const content = Buffer.from(`${JSON.stringify(store, null, 2)}\n`, 'utf8').toString('base64');

  return githubRequest(`/repos/${repository}/contents/${encodedPath}`, {
    method: 'PUT',
    token,
    body: {
      message,
      content,
      sha,
      branch,
    },
  });
}

async function mutateRunsJson({ mutate, message }) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const repoState = await getRunsJsonFromRepo();
      const changed = await mutate(repoState.store);
      if (!changed) return { changed: false };

      await putRunsJsonToRepo({ ...repoState, store: repoState.store, message });
      return { changed: true };
    } catch (error) {
      lastError = error;
      if (!String(error.message || error).includes('(409)')) break;
    }
  }

  throw lastError;
}

async function syncPromptToRunsJson({ activityId, promptText, promptSentAt, chatId, matchedPlan, adherence }) {
  return mutateRunsJson({
    message: `RunBase: save post-run prompt for activity ${activityId}`,
    mutate: (store) => {
      const activity = store.activities?.find((candidate) => candidate.id === activityId);
      if (!activity) throw new Error(`Activity ${activityId} not found in runs.json`);

      activity.post_run = activity.post_run || {};
      activity.post_run.matched_plan = matchedPlan ?? activity.post_run.matched_plan;
      activity.post_run.adherence = adherence ?? activity.post_run.adherence;
      activity.post_run.reflection = {
        ...(activity.post_run.reflection || {}),
        prompt_channel: 'telegram',
        prompt_target: chatId,
        prompt_text: promptText,
        prompt_sent_at: promptSentAt,
      };

      return true;
    },
  });
}

exports.handler = async () => {
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
    if (activity.post_run?.reflection?.prompt_sent_at) continue;
    if (!isRecentEligibleActivity(activity, now, recentWindowHours)) continue;
    if (await getPromptStateByRun(activity.id)) continue;

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
