// One-time Philips Hue Remote API OAuth via the authorization-code flow. A
// throwaway local HTTP server on a FIXED loopback port receives the redirect —
// the callback URL is registered once when creating the app on
// developers.meethue.com and must match exactly. After the token exchange the
// script also provisions a bridge allowlist username through the remote API
// (the cloud equivalent of pressing the bridge's link button).
import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import { writeHueToken } from '../src/hueToken.js';

const clientId = process.env.HUE_CLIENT_ID;
const clientSecret = process.env.HUE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set HUE_CLIENT_ID and HUE_CLIENT_SECRET in server/.env first.');
  process.exit(1);
}

const PORT = 8842;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const REMOTE_API = 'https://api.meethue.com';
const state = crypto.randomBytes(16).toString('hex');

const authUrl = new URL(`${REMOTE_API}/v2/oauth2/authorize`);
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('state', state);

const basicAuth =
  'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

async function provisionUsername(accessToken: string): Promise<string> {
  // Cloud equivalent of pressing the physical link button…
  const linkRes = await fetch(`${REMOTE_API}/route/api/0/config`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkbutton: true }),
  });
  if (!linkRes.ok) throw new Error(`enabling link button failed: ${linkRes.status}`);

  // …followed by the classic username registration, routed through the cloud.
  const userRes = await fetch(`${REMOTE_API}/route/api`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ devicetype: 'nohm' }),
  });
  if (!userRes.ok) throw new Error(`username registration failed: ${userRes.status}`);
  const json = (await userRes.json()) as Array<{ success?: { username?: string } }>;
  const username = json?.[0]?.success?.username;
  if (!username) throw new Error('no username in registration response');
  return username;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', REDIRECT);
  if (requestUrl.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }
  const code = requestUrl.searchParams.get('code');
  try {
    if (!code) throw new Error(requestUrl.searchParams.get('error') ?? 'no code returned');
    if (requestUrl.searchParams.get('state') !== state) throw new Error('state mismatch');

    const tokenRes = await fetch(`${REMOTE_API}/v2/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code }),
    });
    if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
    const json = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    if (!json.refresh_token) throw new Error('no refresh_token returned');

    const username = await provisionUsername(json.access_token);
    writeHueToken({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + json.expires_in * 1000,
      username,
    });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Philips Hue connected — you can close this tab.');
    console.log('✓ Token saved to server/.tokens/hue.json — restart the server to enable the widget.');
    server.close();
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Something went wrong — check the terminal.');
    console.error('✗ OAuth failed:', (err as Error).message);
    server.close();
    process.exitCode = 1;
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nYour Hue app on developers.meethue.com must have this exact callback URL:\n\n  ${REDIRECT}\n`);
  console.log('Open this URL in your browser, log in with your Philips Hue account and approve:\n');
  console.log(authUrl.toString() + '\n');
});
