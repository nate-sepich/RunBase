export function metersToMiles(meters) {
  return Math.round(meters * 0.000621371 * 100) / 100;
}

export function pacePerMile(metersPerSecond) {
  if (!metersPerSecond || metersPerSecond <= 0) return '--:--';
  const secondsPerMile = 1609.34 / metersPerSecond;
  const minutes = Math.floor(secondsPerMile / 60);
  const seconds = Math.round(secondsPerMile % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
