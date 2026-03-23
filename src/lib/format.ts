/** Convert meters to miles, rounded to 2 decimal places */
export function metersToMiles(meters: number): number {
  return Math.round(meters * 0.000621371 * 100) / 100;
}

/** Convert meters/second to pace string (MM:SS per mile) */
export function pacePerMile(metersPerSecond: number): string {
  if (!metersPerSecond || metersPerSecond <= 0) return '--:--';
  const secondsPerMile = 1609.34 / metersPerSecond;
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Format seconds as H:MM:SS or M:SS */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format ISO date string as human-readable (e.g. "Sat, Mar 8, 2026") */
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Format elevation in feet */
export function metersToFeet(meters: number): number {
  return Math.round(meters * 3.28084);
}

/** Activity type display label */
export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    workout: 'Workout',
    long_run: 'Long Run',
    race: 'Race',
  };
  return labels[type] ?? type;
}

/** Activity type color class */
export function typeColor(type: string): string {
  const colors: Record<string, string> = {
    workout: 'text-blue-400 bg-blue-400/10',
    long_run: 'text-emerald-400 bg-emerald-400/10',
    race: 'text-amber-400 bg-amber-400/10',
  };
  return colors[type] ?? 'text-zinc-400 bg-zinc-400/10';
}

/**
 * Map a heart rate to a zone number (1–5) based on max HR.
 * Zones: Z1 <60%, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 90%+
 */
export function hrZone(bpm: number, maxHr: number): 1 | 2 | 3 | 4 | 5 {
  const pct = bpm / maxHr;
  if (pct < 0.60) return 1;
  if (pct < 0.70) return 2;
  if (pct < 0.80) return 3;
  if (pct < 0.90) return 4;
  return 5;
}

/** Zone display label */
export function zoneLabel(zone: 1 | 2 | 3 | 4 | 5): string {
  return ['', 'Recovery', 'Aerobic Base', 'Tempo', 'Threshold', 'VO₂ Max'][zone] as string;
}

/** Tailwind bg color class for a zone */
export function zoneBgColor(zone: 1 | 2 | 3 | 4 | 5): string {
  return [
    '',
    'bg-zinc-500',    // Z1 - Recovery
    'bg-blue-500',    // Z2 - Aerobic Base
    'bg-emerald-500', // Z3 - Tempo
    'bg-orange-500',  // Z4 - Threshold
    'bg-red-500',     // Z5 - VO2 Max
  ][zone] as string;
}

/** Text color class for a zone */
export function zoneTextColor(zone: 1 | 2 | 3 | 4 | 5): string {
  return [
    '',
    'text-zinc-400',    // Z1
    'text-blue-400',    // Z2
    'text-emerald-400', // Z3
    'text-orange-400',  // Z4
    'text-red-400',     // Z5
  ][zone] as string;
}
