import { dataPath } from './paths.js';
import { loadJson } from './jsonStore.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function loadTrainingPlan() {
  return loadJson(dataPath('training-plan.json'));
}

export function loadAthleteConfig() {
  return loadJson(dataPath('athlete.json'));
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function utcToday(now = new Date()) {
  return isoDate(now);
}

export function getPlanStart(trainingPlan) {
  return new Date(`${trainingPlan.plan_start}T00:00:00Z`);
}

export function getWeekStart(trainingPlan, weekNum) {
  const date = new Date(getPlanStart(trainingPlan));
  date.setUTCDate(date.getUTCDate() + (weekNum - 1) * 7);
  return date;
}

export function getSessionDate(trainingPlan, weekNum, dayName) {
  const weekStart = getWeekStart(trainingPlan, weekNum);
  const targetDay = DAYS.indexOf(dayName);
  const startDay = weekStart.getUTCDay();
  let diff = targetDay - startDay;
  if (diff < 0) diff += 7;
  const date = new Date(weekStart);
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

export function resolveCurrentWeek(trainingPlan, now = new Date()) {
  const todayIso = utcToday(now);

  for (const week of trainingPlan.weeks) {
    const weekStartIso = isoDate(getWeekStart(trainingPlan, week.week));
    const weekEnd = new Date(getWeekStart(trainingPlan, week.week).getTime() + 6 * 86400000);
    const weekEndIso = isoDate(weekEnd);
    if (todayIso >= weekStartIso && todayIso <= weekEndIso) {
      return week.week;
    }
  }

  return 0;
}

export function findTodaysSession(trainingPlan, now = new Date()) {
  const todayIso = utcToday(now);
  const currentWeek = resolveCurrentWeek(trainingPlan, now);
  if (!currentWeek) return null;

  const weekData = trainingPlan.weeks.find((week) => week.week === currentWeek);
  if (!weekData) return null;

  for (const session of weekData.sessions) {
    const sessionDate = getSessionDate(trainingPlan, currentWeek, session.day);
    if (isoDate(sessionDate) === todayIso) {
      return { ...session, week: currentWeek, theme: weekData.theme, date: todayIso };
    }
  }

  return null;
}
