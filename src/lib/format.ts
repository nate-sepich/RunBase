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
