function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function getRepoConfig() {
  return {
    token: requireEnv('RUNBASE_GITHUB_WRITE_TOKEN'),
    repository: process.env.RUNBASE_GITHUB_REPOSITORY || 'nate-sepich/RunBase',
    branch: process.env.RUNBASE_GITHUB_BRANCH || 'main',
    runsPath: process.env.RUNBASE_GITHUB_RUNS_PATH || 'data/runs.json',
  };
}

async function githubRequest(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'runbase-automation',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function loadRunsJsonDocument() {
  const { token, repository, branch, runsPath } = getRepoConfig();
  const encodedPath = encodeURIComponent(runsPath).replace(/%2F/g, '/');
  const data = await githubRequest(
    `/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
    { token },
  );

  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return {
    token,
    repository,
    branch,
    runsPath,
    sha: data.sha,
    store: JSON.parse(content),
  };
}

async function saveRunsJsonDocument({ token, repository, branch, runsPath, sha, store, message }) {
  const encodedPath = encodeURIComponent(runsPath).replace(/%2F/g, '/');
  const content = Buffer.from(JSON.stringify(store, null, 2) + '\n', 'utf8').toString('base64');

  return githubRequest(`/repos/${repository}/contents/${encodedPath}`, {
    method: 'PUT',
    token,
    body: {
      message,
      content,
      sha,
      branch,
    },
  });
}

async function withRunsJsonMutation({ mutate, message }) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const doc = await loadRunsJsonDocument();
      const changed = await mutate(doc.store);
      if (!changed) {
        return { changed: false };
      }
      await saveRunsJsonDocument({ ...doc, store: doc.store, message });
      return { changed: true };
    } catch (error) {
      lastError = error;
      if (!String(error.message || error).includes('(409)')) {
        break;
      }
    }
  }

  throw lastError;
}

export async function syncPromptToRunsJson({ activityId, promptText, promptSentAt, chatId, matchedPlan, adherence }) {
  return withRunsJsonMutation({
    message: `RunBase: save post-run prompt for activity ${activityId}`,
    mutate: (store) => {
      const activity = store.activities?.find((entry) => entry.id === activityId);
      if (!activity) {
        throw new Error(`Activity ${activityId} not found in runs.json`);
      }

      activity.post_run = activity.post_run || {};
      activity.post_run.matched_plan = matchedPlan ?? activity.post_run.matched_plan;
      activity.post_run.adherence = adherence ?? activity.post_run.adherence;
      activity.post_run.reflection = {
        ...(activity.post_run.reflection || {}),
        prompt_channel: 'telegram',
        prompt_target: chatId,
        prompt_text: promptText,
        prompt_sent_at: promptSentAt,
      };

      return true;
    },
  });
}

export async function syncReplyToRunsJson({ activityId, replyText, replyReceivedAt }) {
  return withRunsJsonMutation({
    message: `RunBase: save post-run reply for activity ${activityId}`,
    mutate: (store) => {
      const activity = store.activities?.find((entry) => entry.id === activityId);
      if (!activity) {
        throw new Error(`Activity ${activityId} not found in runs.json`);
      }

      activity.post_run = activity.post_run || {};
      activity.post_run.reflection = {
        ...(activity.post_run.reflection || {}),
        reply_text: replyText,
        reply_received_at: replyReceivedAt,
      };

      return true;
    },
  });
}
