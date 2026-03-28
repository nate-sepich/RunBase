const DEFAULT_DATA_BASE_URL = 'https://raw.githubusercontent.com/nate-sepich/RunBase/main/data';

export function getRunbaseDataBaseUrl() {
  return process.env.RUNBASE_DATA_BASE_URL || DEFAULT_DATA_BASE_URL;
}

export async function fetchRepoJson(fileName) {
  const baseUrl = getRunbaseDataBaseUrl().replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/${fileName}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${fileName}: ${response.status}`);
  }
  return response.json();
}
