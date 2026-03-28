import path from 'path';

export const REPO_ROOT = process.cwd();
export const DATA_DIR = path.join(REPO_ROOT, 'data');

export function dataPath(fileName) {
  return path.join(DATA_DIR, fileName);
}
