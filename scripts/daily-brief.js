#!/usr/bin/env node
/**
 * RunBase Daily Brief Generator
 *
 * Generates and sends Gabe's 4am training brief via iMessage relay.
 * Resolves today's session from training-plan.json, fetches weather from Open-Meteo,
 * calculates nutrition recommendations, and sends formatted message.
 *
 * Usage:
 *   node scripts/daily-brief.js
 *
 * Env vars (optional, for testing):
 *   DRY_RUN=true    Print message without sending
 *   TEST_PHONE=...  Override Gabe's number for testing
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '../data');

const DRY_RUN = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
const TEST_PHONE = process.env.TEST_PHONE;

// --- Load data ---
const trainingPlan = JSON.parse(fs.readFileSync(path.join(DATA_PATH, 'training-plan.json'), 'utf8'));
const athleteConfig = JSON.parse(fs.readFileSync(path.join(DATA_PATH, 'athlete.json'), 'utf8'));
const runStore = JSON.parse(fs.readFileSync(path.join(DATA_PATH, 'runs.json'), 'utf8'));

// --- Config ---
const GABE_PHONE = TEST_PHONE || athleteConfig.location?.phone || '+15155870179'; // fallback to known number
const BRIEF_TIME_UTC = athleteConfig.notification?.brief_time_utc || '09:00'; // 9am UTC = 4am CDT
const LOCATION = athleteConfig.location || { city: 'Des Moines', state: 'IA', lat: 41.5868, lon: -93.6250 };

// --- Helper functions ---
function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStart(weekNum) {
  const planStart = new Date(trainingPlan.plan_start + 'T00:00:00Z');
  const d = new Date(planStart);
  d.setUTCDate(d.getUTCDate() + (weekNum - 1) * 7);
  return d;
}

function getSessionDate(weekNum, dayName) {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const weekStart = getWeekStart(weekNum); // Monday
  const targetDay = days.indexOf(dayName);
  const startDay = weekStart.getUTCDay(); // 0=Sun
  let diff = targetDay - startDay;
  if (diff < 0) diff += 7;
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

// --- Find today's session ---
function findTodaysSession() {
  const todayIso = today();
  let todaysSession = null;
  let currentWeek = 0;

  // Find current week
  for (const week of trainingPlan.weeks) {
    const ws = isoDate(getWeekStart(week.week));
    const we = isoDate(new Date(getWeekStart(week.week).getTime() + 6 * 86400000));
    if (todayIso >= ws && todayIso <= we) {
      currentWeek = week.week;
      break;
    }
  }

  // Find today's session in current week
  const weekData = trainingPlan.weeks.find(w => w.week === currentWeek);
  if (!weekData) return null;

  for (const session of weekData.sessions) {
    const sessionDate = getSessionDate(currentWeek, session.day);
    if (isoDate(sessionDate) === todayIso) {
      return { ...session, week: currentWeek };
    }
  }
  return null;
}

// --- Format pace ---
function pacePerMile(metersPerSecond) {
  if (!metersPerSecond || metersPerSecond <= 0) return '--:--';
  const secondsPerMile = 1609.34 / metersPerSecond;
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// --- Weather fetch (Open-Meteo, free, no key) ---
async function fetchWeather() {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.lat}&longitude=${LOCATION.lon}&hourly=temperature_2m,windspeed_10m,winddirection_10m&current_weather=true&timezone=America%2FChicago`
    );
    if (!res.ok) throw new Error(`Weather API failed: ${res.status}`);
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[brief] Weather fetch failed:', err.message);
    return null;
  }
}

// --- Nutrition recommendations ---
function getNutritionRecs(distanceMiles, durationMinutes) {
  const recs = [];

  // Pre-run hydration
  if (durationMinutes < 45) {
    recs.push('• Hydrate 8–12oz water before you head out');
  } else if (durationMinutes < 75) {
    recs.push('• Hydrate 12–16oz water before you head out');
  } else if (durationMinutes < 120) {
    recs.push('• Hydrate 16–20oz water before you head out');
  } else {
    recs.push('• Hydrate 20oz + electrolytes before you head out');
  }

  // Fuel during run
  if (durationMinutes >= 45 && durationMinutes < 75) {
    recs.push('• 45min+: 1 gel optional at mile 4+');
  } else if (durationMinutes >= 75 && durationMinutes < 120) {
    recs.push('• 45min+: 1 gel per 45min');
  } else if (durationMinutes >= 120) {
    recs.push('• 45min+: 1 gel per 45min, electrolytes at 60min');
  }

  // Hot weather modifier (>75°F)
  // Cold weather modifier (<32°F) - mentioned in general advice

  if (recs.length === 0) {
    recs.push('• No special nutrition needed for this effort');
  }

  return recs;
}

// --- Format brief message ---
async function formatBrief() {
  const session = findTodaysSession();
  const weather = await fetchWeather();
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  if (!session) {
    return `🏃 Morning, Gabe! Today is a rest day or cross-training day.\n\n📅 ${todayStr}\n💤 Enjoy your recovery — see you tomorrow!`;
  }

  // Determine HR zone label from pace target
  let zoneLabel = 'Z2'; // default
  if (session.pace_target?.includes('8:00') || session.pace_target?.includes('8:10')) {
    zoneLabel = 'Z3–Z4'; // tempo
  } else if (session.pace_target?.includes('7:35')) {
    zoneLabel = 'Z4–Z5'; // race/workout
  }

  const weatherSection = weather && weather.current_weather ? `
🌤 WEATHER (${LOCATION.city}, ${new Date().toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit', timeZoneName:'short'})}): 
${Math.round(weather.current_weather.temperature)}°F, winds ${Math.round(weather.current_weather.windspeed)}mph ${getWindDirection(weather.current_weather.winddirection)}
→ Dress: ${getDressAdvice(weather.current_weather.temperature)}` :
  `🌤 WEATHER: Data unavailable`;

  const nutritionSection = `
💧 NUTRITION:
${getNutritionRecs(session.distance_miles ?? 0, estimateDurationMinutes(session)).join('\n')}`;

  return `🏃 Morning, Gabe! Here's your training brief:

📋 TODAY: ${session.distance_miles ?? 'X'} miles @ ${session.pace_target ?? 'X:XX/mi'} pace (${zoneLabel} effort)
Zone target: ${getZoneBpmRange(session)} bpm

${weatherSection}

${nutritionSection}

📍 Full plan: https://gabe.github.io/RunBase

Good luck out there 💪`;
}

// --- Helper functions ---
function getWindDirection(degrees) {
  const directions = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

function getDressAdvice(tempF) {
  if (tempF >= 75) return 'Lightweight shirt + shorts, hat, sunscreen';
  if (tempF >= 60) return 'Short-sleeve + shorts, light layers';
  if (tempF >= 45) return 'Long-sleeve + light jacket, gloves optional';
  if (tempF >= 32) return 'Jacket + hat, gloves recommended';
  return 'Heavy jacket + hat + gloves, consider treadmill';
}

function getZoneBpmRange(session) {
  const maxHR = athleteConfig.max_hr || 200;
  if (!session.hr_bpm_range) return `${Math.round(maxHR * 0.6)}–${Math.round(maxHR * 0.8)}`;
  return session.hr_bpm_range;
}

function estimateDurationMinutes(session) {
  if (!session.distance_miles || !session.pace_target) return 0;
  // Parse pace like "8:00–8:10/mi" or "7:35/mi"
  const paceMatch = session.pace_target?.match(/(\d+):(\d+)/);
  if (!paceMatch) return 0;
  const minutes = parseInt(paceMatch[1]);
  const seconds = parseInt(paceMatch[2]);
  const paceSecondsPerMile = minutes * 60 + seconds;
  return Math.round((paceSecondsPerMile * session.distance_miles) / 60);
}

// --- Send via iMessage ---
async function sendImessage(message) {
  // Use imsg CLI to send via Messages.app
  const args = [
    'send',
    '--to', GABE_PHONE.replace(/[^\d]/g, ''), // strip non-digits
    '--text', message,
    '--service', 'sms' // force SMS (green bubble) for reliability
  ];

  try {
    execSync(`imsg ${args.join(' ')}`, { stdio: 'pipe' });
    return true;
  } catch (err) {
    console.error('[brief] iMessage send failed:', err.message);
    return false;
  }
}

// --- Main ---
async function main() {
  console.log('[brief] Generating daily brief...');

  const message = await formatBrief();
  console.log('[brief] Message generated:');
  console.log('---');
  console.log(message);
  console.log('---');

  if (DRY_RUN) {
    console.log('[brief] DRY RUN — message not sent');
    return;
  }

  const sent = await sendImessage(message);
  if (sent) {
    console.log('[brief] ✅ Brief sent via iMessage/SMS');
  } else {
    console.error('[brief] ❌ Failed to send brief');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[brief] Fatal error:', err);
  process.exit(1);
});