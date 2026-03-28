import { dataPath } from './paths.js';
import { loadJson, saveJson } from './jsonStore.js';
import { metersToMiles, pacePerMile } from './formatters.js';
import { loadTrainingPlan, getSessionDate, isoDate } from './trainingPlan.js';

export function loadRunStore() {
  return loadJson(dataPath('runs.json'));
}

export function saveRunStore(store) {
  saveJson(dataPath('runs.json'), store);
}

export function matchPlannedSession(trainingPlan, activity) {
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

export function summarizeAdherence(activity, matchedPlan) {
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
      : Math.abs(actualMiles - plannedMiles) / plannedMiles <= 0.20;

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

export function buildReflectionPrompt(activity, matchedPlan, adherence) {
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

export function pickEligibleActivity(store, activityId = null) {
  if (activityId) {
    return store.activities.find((activity) => activity.id === activityId) ?? null;
  }

  return store.activities.find((activity) => !activity.post_run?.reflection?.prompt_sent_at) ?? null;
}

export function preparePostRunPrompt({ store, trainingPlan, activityId = null, now = new Date(), channel = 'telegram', target }) {
  const repoStore = store ?? loadRunStore();
  const plan = trainingPlan ?? loadTrainingPlan();
  const activity = pickEligibleActivity(repoStore, activityId);

  if (!activity) {
    return null;
  }

  const matchedPlan = matchPlannedSession(plan, activity);
  const adherence = summarizeAdherence(activity, matchedPlan);
  const prompt = buildReflectionPrompt(activity, matchedPlan, adherence);
  const nowIso = now.toISOString();

  activity.post_run = {
    matched_plan: matchedPlan ?? undefined,
    adherence,
    reflection: {
      ...(activity.post_run?.reflection ?? {}),
      prompt_channel: channel,
      prompt_target: target,
      prompt_text: prompt,
      prompt_sent_at: nowIso,
    },
  };

  return {
    store: repoStore,
    activity,
    matchedPlan,
    adherence,
    prompt,
    handoff: {
      channel,
      target,
      activity_id: activity.id,
      prompt,
    },
  };
}
