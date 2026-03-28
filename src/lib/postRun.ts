import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Activity } from './types';
import { metersToMiles, pacePerMile } from './format';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const trainingPlan = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../data/training-plan.json'), 'utf8')
);

export type PlannedSessionType =
  | 'easy'
  | 'tempo'
  | 'workout'
  | 'long_run'
  | 'race'
  | 'rest'
  | 'cross'
  | 'easy_plus_cross'
  | 'flex';

export interface PlannedSession {
  day: string;
  type: PlannedSessionType;
  distance_miles: number | null;
  pace_target: string | null;
  hr_zone: string | null;
  hr_bpm_range: string | null;
  notes: string;
}

export interface MatchedPlan {
  week: number;
  theme?: string;
  date: string;
  session: PlannedSession;
}

export interface PostRunAdherence {
  status: 'matched' | 'modified' | 'off_plan';
  summary: string;
  actual_distance_miles: number;
  actual_pace_per_mile: string;
}

function getPlanStart(): Date {
  return new Date(trainingPlan.plan_start + 'T00:00:00Z');
}

export function getWeekStart(weekNum: number): Date {
  const d = new Date(getPlanStart());
  d.setUTCDate(d.getUTCDate() + (weekNum - 1) * 7);
  return d;
}

export function getSessionDate(weekNum: number, dayName: string): Date {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekStart = getWeekStart(weekNum);
  const targetDay = days.indexOf(dayName);
  const startDay = weekStart.getUTCDay();
  let diff = targetDay - startDay;
  if (diff < 0) diff += 7;
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function matchPlannedSession(activity: Activity): MatchedPlan | null {
  const actIso = activity.date.slice(0, 10);

  for (const week of trainingPlan.weeks) {
    for (const session of week.sessions) {
      const sessionDate = getSessionDate(week.week, session.day);
      const sessionIso = isoDate(sessionDate);
      const diffDays = Math.abs(
        (new Date(actIso).getTime() - new Date(sessionIso).getTime()) / 86400000
      );
      if (diffDays > 1) continue;

      if (!session.distance_miles) {
        if (session.type === 'rest' || session.type === 'cross' || session.type === 'flex') {
          continue;
        }
        return {
          week: week.week,
          theme: (week as any).theme,
          date: sessionIso,
          session: session as PlannedSession,
        };
      }

      const actualMiles = metersToMiles(activity.distance_meters);
      const distanceDelta = Math.abs(actualMiles - session.distance_miles) / session.distance_miles;
      if (distanceDelta <= 0.25) {
        return {
          week: week.week,
          theme: (week as any).theme,
          date: sessionIso,
          session: session as PlannedSession,
        };
      }
    }
  }

  return null;
}

export function summarizeAdherence(activity: Activity, matchedPlan: MatchedPlan | null): PostRunAdherence {
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

export function buildReflectionPrompt(activity: Activity, matchedPlan: MatchedPlan | null, adherence: PostRunAdherence): string {
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
