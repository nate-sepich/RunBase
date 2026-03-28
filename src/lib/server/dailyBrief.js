import { loadAthleteConfig, loadTrainingPlan, findTodaysSession } from './trainingPlan.js';

export function getWindDirection(degrees) {
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((degrees ?? 0) / 22.5) % 16;
  return directions[index];
}

export function getDressAdvice(tempF) {
  if (tempF >= 75) return 'Lightweight shirt + shorts, hat, sunscreen';
  if (tempF >= 60) return 'Short-sleeve + shorts, light layers';
  if (tempF >= 45) return 'Long-sleeve + light jacket, gloves optional';
  if (tempF >= 32) return 'Jacket + hat, gloves recommended';
  return 'Heavy jacket + hat + gloves, consider treadmill';
}

export function getZoneLabel(session) {
  if (session?.hr_zone) return session.hr_zone;
  if (session?.pace_target?.includes('8:00') || session?.pace_target?.includes('8:10')) return 'Z3–Z4';
  if (session?.pace_target?.includes('7:35')) return 'Z4–Z5';
  return 'Z2';
}

export function getZoneBpmRange(session, athleteConfig) {
  const maxHR = athleteConfig.max_hr || 200;
  if (!session?.hr_bpm_range) return `${Math.round(maxHR * 0.6)}–${Math.round(maxHR * 0.8)}`;
  return session.hr_bpm_range;
}

export function estimateDurationMinutes(session) {
  if (!session?.distance_miles || !session?.pace_target) return 0;
  const paceMatch = session.pace_target.match(/(\d+):(\d+)/);
  if (!paceMatch) return 0;
  const minutes = parseInt(paceMatch[1], 10);
  const seconds = parseInt(paceMatch[2], 10);
  const paceSecondsPerMile = minutes * 60 + seconds;
  return Math.round((paceSecondsPerMile * session.distance_miles) / 60);
}

export function getNutritionRecs(distanceMiles, durationMinutes, temperatureF = null) {
  const recs = [];

  if (durationMinutes < 45) {
    recs.push('• Hydrate 8–12oz water before you head out');
  } else if (durationMinutes < 75) {
    recs.push('• Hydrate 12–16oz water before you head out');
  } else if (durationMinutes < 120) {
    recs.push('• Hydrate 16–20oz water before you head out');
  } else {
    recs.push('• Hydrate 20oz + electrolytes before you head out');
  }

  if (durationMinutes >= 45 && durationMinutes < 75) {
    recs.push('• 45min+: 1 gel optional at mile 4+');
  } else if (durationMinutes >= 75 && durationMinutes < 120) {
    recs.push('• 45min+: 1 gel per 45min');
  } else if (durationMinutes >= 120) {
    recs.push('• 45min+: 1 gel per 45min, electrolytes at 60min');
  }

  if (temperatureF !== null && temperatureF > 75) {
    recs.push('• Heat bump: add ~8oz extra fluids and consider electrolytes');
  }

  if (temperatureF !== null && temperatureF < 32) {
    recs.push('• Cold reminder: hydrate anyway even if you do not feel thirsty');
  }

  if (recs.length === 0) {
    recs.push('• No special nutrition needed for this effort');
  }

  return recs;
}

export async function fetchWeather(location) {
  const query = new URLSearchParams({
    latitude: String(location.lat),
    longitude: String(location.lon),
    current_weather: 'true',
    timezone: 'America/Chicago',
    temperature_unit: 'fahrenheit',
    windspeed_unit: 'mph',
  });

  const url = `https://api.open-meteo.com/v1/forecast?${query.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API failed: ${response.status}`);
  }

  return response.json();
}

export async function generateDailyBrief({ trainingPlan, athleteConfig, now = new Date(), weatherData = null } = {}) {
  const plan = trainingPlan ?? loadTrainingPlan();
  const athlete = athleteConfig ?? loadAthleteConfig();
  const location = athlete.location || { city: 'Des Moines', state: 'IA', lat: 41.5868, lon: -93.6250 };
  const session = findTodaysSession(plan, now);
  const weather = weatherData ?? await fetchWeather(location).catch((error) => {
    console.warn('[daily-brief] Weather fetch failed:', error.message);
    return null;
  });
  const localTimeZone = 'America/Chicago';

  const todayStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: localTimeZone,
  });

  if (!session) {
    return {
      session: null,
      weather,
      message: `🏃 Morning, Gabe! Today is a rest day or cross-training day.\n\n📅 ${todayStr}\n💤 Enjoy your recovery — see you tomorrow!`,
    };
  }

  const currentWeather = weather?.current_weather ?? null;
  const localWeatherTime = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: localTimeZone,
    timeZoneName: 'short',
  });
  const weatherSection = currentWeather
    ? `🌤 WEATHER (${location.city}, ${localWeatherTime}):\n${Math.round(currentWeather.temperature)}°F, winds ${Math.round(currentWeather.windspeed)}mph ${getWindDirection(currentWeather.winddirection)}\n→ Dress: ${getDressAdvice(currentWeather.temperature)}`
    : '🌤 WEATHER: Data unavailable';

  const nutritionSection = `💧 NUTRITION:\n${getNutritionRecs(
    session.distance_miles ?? 0,
    estimateDurationMinutes(session),
    currentWeather?.temperature ?? null,
  ).join('\n')}`;

  const message = `🏃 Morning, Gabe! Here's your training brief:\n\n📋 TODAY: ${session.distance_miles ?? 'X'} miles @ ${session.pace_target ?? 'X:XX/mi'} pace (${getZoneLabel(session)} effort)\nZone target: ${getZoneBpmRange(session, athlete)} bpm\n\n${weatherSection}\n\n${nutritionSection}\n\n📍 Full plan: https://nate-sepich.github.io/RunBase\n\nGood luck out there 💪`;

  return { session, weather, message };
}
