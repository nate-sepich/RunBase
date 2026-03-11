#!/usr/bin/env node
/**
 * RunBase One-Time OAuth Setup
 *
 * Run this locally once per athlete to obtain a Strava refresh token.
 * The token is then stored as a GitHub Actions secret and self-rotates
 * on every ETL run.
 *
 * Usage:
 *   STRAVA_CLIENT_ID=xxx STRAVA_CLIENT_SECRET=yyy node scripts/oauth-setup.js
 *
 * On success, outputs the secrets to add to your GitHub repo.
 */

import http from 'http';
import { exec } from 'child_process';

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET before running.');
  console.error('  STRAVA_CLIENT_ID=xxx STRAVA_CLIENT_SECRET=yyy node scripts/oauth-setup.js');
  process.exit(1);
}

const PORT = 8080;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const AUTH_URL =
  `https://www.strava.com/oauth/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=activity:read_all` +
  `&approval_prompt=force`;

console.log('\n=== RunBase — Strava OAuth Setup ===\n');
console.log('Opening your browser to authorize with Strava...');
console.log('\nIf the browser does not open automatically, visit:\n');
console.log(AUTH_URL);
console.log('');

// Open browser
const openCmd =
  process.platform === 'darwin' ? 'open' :
  process.platform === 'win32' ? 'start' :
  'xdg-open';
exec(`${openCmd} "${AUTH_URL}"`);

// Local callback server
const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) {
    res.writeHead(404);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h2>Authorization denied or failed. Check your terminal.</h2>');
    console.error('\nAuthorization failed:', error ?? 'no code received');
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2>Authorization successful! You can close this tab.</h2>');
  server.close();

  // Exchange code for tokens
  console.log('\nExchanging authorization code for tokens...');
  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });

    const data = await tokenRes.json();

    if (!tokenRes.ok || data.errors) {
      console.error('\nToken exchange failed:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n=== SUCCESS ===');
    console.log(`\nAthlete: ${data.athlete.firstname} ${data.athlete.lastname}`);
    console.log('\nAdd these three secrets to your GitHub repository:');
    console.log('  Settings → Secrets and variables → Actions → New repository secret\n');
    console.log(`  STRAVA_CLIENT_ID     = ${CLIENT_ID}`);
    console.log(`  STRAVA_CLIENT_SECRET = ${CLIENT_SECRET}`);
    console.log(`  STRAVA_REFRESH_TOKEN = ${data.refresh_token}`);
    console.log('\nOptional (enables automatic token rotation):');
    console.log('  REPO_PAT = <GitHub personal access token with repo secrets:write scope>');
    console.log('\nAccess token (expires in 6h, not needed for GH Actions):');
    console.log(`  ${data.access_token}`);
  } catch (err) {
    console.error('\nToken exchange error:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Listening for Strava callback on http://localhost:${PORT}/callback`);
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Stop the process using it and retry.`);
  } else {
    console.error('\nServer error:', err.message);
  }
  process.exit(1);
});
