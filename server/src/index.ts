import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { google } from 'googleapis';
import { z } from 'zod';
import { parseHealthIngestBody } from './healthIngest.js';
import {
  EXTERNALLY_WRITTEN_PROVIDER_IDS,
  listenForProviderRefresh,
  notifyProviderRefresh,
} from './refreshNotify.js';
import { createWidgetEventStream } from './widgetEvents.js';
import { persistProviderHistory } from './providerHistory.js';
import { loadConfig } from './config.js';
import { loadEnv } from './env.js';
import { createDatabase } from './db/client.js';
import { migrateDatabase } from './db/migrate.js';
import { LayoutStore } from './layoutStore.js';
import { ProviderScheduler } from './scheduler.js';
import { createProviders } from './providers/index.js';
import { createCommandCenterProvider } from './providers/commandCenter.js';
import { SignalHistoryStore } from './signalHistory.js';
import { createIssue, issueErrorCode, parseIssueInput } from './issues.js';
import { availableProjects, codeActionError, launchCodeAction } from './codeSession.js';
import { createOwnedReposCache, listOwnedRepos } from './providers/github.js';
import { todayInZone } from './providers/health.js';
import { sendCiderCommand, type CiderCommand } from './providers/cider.js';
import {
  ServiceSettingsStore,
  applyServiceSettingsToEnvironment,
  isConfigurableServiceId,
  serviceSettingsSchemas,
} from './serviceSettings.js';
import { writeSpotifyToken } from './spotifyToken.js';
import { writeGmailToken } from './gmailToken.js';
import { md5Hex } from './md5.js';
import { signOAuthState, verifyOAuthState } from './oauthState.js';

// A transient network blip (e.g. a Postgres socket erroring outside any awaited query, as seen
// with Railway's TCP proxy) otherwise crashes the whole process — Node treats an unhandled
// rejection as fatal by default. launchd's KeepAlive then restarts it in a tight loop, wiping every
// provider's in-memory state each time, which is why polling-cadence data (like the Claude usage
// widget's PTY probe) can look frozen for hours even though nothing in the providers themselves
// is broken. Log and keep running instead, matching this codebase's provider-level resilience.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[server] uncaught exception:', error);
});

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data');
const serviceSettingsStore = new ServiceSettingsStore(path.join(dataDir, 'service-settings.json'));
const storedServiceSettings = await serviceSettingsStore.load();
applyServiceSettingsToEnvironment(storedServiceSettings);
const env = loadEnv();
const config = loadConfig();
const database = createDatabase(env.databaseUrl);
if (database.mode === 'memory') {
  console.info('[storage] mode local sans persistance : configurez DATABASE_URL pour conserver et synchroniser les historiques.');
}
await migrateDatabase(database);
const app = express();
app.disable('x-powered-by');
app.use(express.json());

const scheduler = new ProviderScheduler();
const providers = createProviders(env, config, database, () => scheduler.getEnvelope('clash-royale')?.data);
for (const provider of providers.all) {
  scheduler.register(provider);
}
const signalHistory = new SignalHistoryStore(database);
scheduler.register(createCommandCenterProvider(scheduler, signalHistory, config));
// Archive every provider's payload as it settles. Unchanged readings are skipped, so the archive
// grows with the data rather than with the poll rate.
persistProviderHistory(scheduler, signalHistory, config.history.excludeProviders);
// Bound that growth. Runs on every dashboard rather than an elected one: the delete is idempotent
// and cheap, and electing a leader would mean nothing prunes while that machine is asleep.
if (config.history.retentionDays > 0) {
  const prune = () => {
    void signalHistory
      .prune(config.history.retentionDays)
      .then((rows) => {
        if (rows > 0) console.log(`[history] pruned ${rows} observations older than ${config.history.retentionDays}d`);
      })
      .catch((error) => console.error('[history] could not prune:', error));
  };
  prune();
  setInterval(prune, config.history.pruneIntervalMs).unref();
}
// Recompute the ranking as soon as any source settles, not just on command-center's own timer —
// otherwise a cold start can snapshot an all-fallback ranking and sit on it for a full cycle.
// Throttled: with ~15 providers settling independently (some every few seconds), triggering the
// DB-heavy command-center fetch on every single settle saturates the Postgres pool and starves
// command-center's own 5s budget — see the timeout incident this was written to fix.
const COMMAND_CENTER_SETTLE_THROTTLE_MS = 10_000;
let commandCenterSettleTimer: NodeJS.Timeout | undefined;
scheduler.onSettled((id) => {
  if (id === 'command-center' || commandCenterSettleTimer) return;
  commandCenterSettleTimer = setTimeout(() => {
    commandCenterSettleTimer = undefined;
    void scheduler.refresh('command-center');
  }, COMMAND_CENTER_SETTLE_THROTTLE_MS);
  commandCenterSettleTimer.unref?.();
});
scheduler.start();
const layoutStore = new LayoutStore(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/layout.json'),
);
const ownedReposCache = createOwnedReposCache();


app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

function configuredServiceIds(): string[] {
  const ids = new Set<string>(serviceSettingsStore.configuredIds());
  if (env.weather) ids.add('weather');
  if (env.icloud) ids.add('calendar');
  if (env.google) ids.add('gmail');
  if (env.github) ids.add('github');
  if (env.steam) ids.add('steam');
  if (env.cider) ids.add('cider');
  if (env.spotify) ids.add('spotify');
  if (env.lastfm) ids.add('lastfm');
  if (env.valorant) ids.add('valorant');
  if (env.clashRoyale) ids.add('clashRoyale');
  if (env.clashOfClans) ids.add('clashOfClans');
  if (env.roblox) ids.add('roblox');
  return [...ids];
}

// OAuth app credentials can come from the environment or from what was saved in the Settings UI,
// so "Connecter le compte" lights up as soon as the id/secret are saved — no restart in between.
function spotifyCreds(): { clientId: string; clientSecret: string } | undefined {
  if (env.spotify) return env.spotify;
  const s = serviceSettingsStore.get('spotify');
  return s.SPOTIFY_CLIENT_ID && s.SPOTIFY_CLIENT_SECRET ? { clientId: s.SPOTIFY_CLIENT_ID, clientSecret: s.SPOTIFY_CLIENT_SECRET } : undefined;
}
function googleCreds(): { clientId: string; clientSecret: string } | undefined {
  if (env.google) return env.google;
  const s = serviceSettingsStore.get('gmail');
  return s.GOOGLE_CLIENT_ID && s.GOOGLE_CLIENT_SECRET ? { clientId: s.GOOGLE_CLIENT_ID, clientSecret: s.GOOGLE_CLIENT_SECRET } : undefined;
}
// The origin OAuth callbacks are built against. A public HTTPS origin (a `tailscale serve`
// hostname) lets "Se connecter" run from the phone; loopback is the default. Store value wins so
// a fresh save in Settings applies without a restart.
function publicBaseUrl(): string {
  const stored = serviceSettingsStore.get('general').NOHM_PUBLIC_URL;
  if (stored) {
    try { return new URL(stored).origin; } catch { /* fall through */ }
  }
  return env.publicUrl ?? `http://127.0.0.1:${env.port}`;
}

function lastfmCreds(): { apiKey: string; secret: string } | undefined {
  const s = serviceSettingsStore.get('lastfm');
  const apiKey = s.LASTFM_API_KEY || process.env.LASTFM_API_KEY;
  const secret = s.LASTFM_SECRET || process.env.LASTFM_SECRET;
  return apiKey && secret ? { apiKey, secret } : undefined;
}

app.get('/api/settings/services', (_req, res) => {
  res.json({
    configured: configuredServiceIds(),
    oauthReady: [
      googleCreds() ? 'gmail' : null,
      spotifyCreds() ? 'spotify' : null,
      lastfmCreds() ? 'lastfm' : null,
    ].filter(Boolean),
    // What OAuth redirect URIs the user must register with each provider.
    callbackBase: publicBaseUrl(),
  });
});

const oauthRedirect = (service: 'gmail' | 'spotify') => `${publicBaseUrl()}/api/settings/oauth/${service}/callback`;
const oauthResultPage = (title: string, detail: string) => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a10;color:#f6f5fb;font:16px system-ui}.card{max-width:34rem;margin:1rem;padding:2rem;border:1px solid #292b38;border-radius:24px;background:#12131c;box-shadow:0 24px 80px #0008}h1{margin:0 0 .6rem;font-size:1.6rem}p{color:#aaaebe;line-height:1.5}button{border:0;border-radius:12px;padding:.7rem 1rem;background:#736bff;color:white;font-weight:700;cursor:pointer}</style><main class="card"><h1>${title}</h1><p>${detail}</p><button onclick="window.close()">Fermer cet onglet</button></main></html>`;

app.get('/api/settings/oauth/spotify/start', (_req, res) => {
  const creds = spotifyCreds();
  if (!creds) { res.status(409).send(oauthResultPage('Spotify n’est pas prêt', 'Enregistrez d’abord l’ID client et le secret Spotify.')); return; }
  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', creds.clientId);
  url.searchParams.set('scope', 'user-read-currently-playing user-read-recently-played user-top-read');
  url.searchParams.set('redirect_uri', oauthRedirect('spotify'));
  url.searchParams.set('state', signOAuthState(dataDir, 'spotify'));
  res.redirect(url.toString());
});

app.get('/api/settings/oauth/spotify/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const creds = spotifyCreds();
  if (!creds || !verifyOAuthState(dataDir, state, 'spotify') || !code) { res.status(400).send(oauthResultPage('Connexion refusée', 'La demande Spotify a expiré ou a été annulée.')); return; }
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}` }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: oauthRedirect('spotify') }) });
    const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!response.ok || !token.access_token || !token.refresh_token || !token.expires_in) throw new Error('token exchange failed');
    writeSpotifyToken({ access_token: token.access_token, refresh_token: token.refresh_token, expires_at: Date.now() + token.expires_in * 1000 });
    res.send(oauthResultPage('Spotify est connecté', 'Vous pouvez fermer cet onglet puis actualiser Nohm.'));
  } catch { res.status(502).send(oauthResultPage('Connexion impossible', 'Spotify n’a pas accepté la connexion. Vérifiez l’URI de redirection dans votre application Spotify.')); }
});

app.get('/api/settings/oauth/gmail/start', (_req, res) => {
  const creds = googleCreds();
  if (!creds) { res.status(409).send(oauthResultPage('Gmail n’est pas prêt', 'Enregistrez d’abord l’ID client et le secret Google.')); return; }
  const auth = new google.auth.OAuth2(creds.clientId, creds.clientSecret, oauthRedirect('gmail'));
  res.redirect(auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', state: signOAuthState(dataDir, 'gmail'), scope: ['https://www.googleapis.com/auth/gmail.metadata'] }));
});

app.get('/api/settings/oauth/gmail/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const creds = googleCreds();
  if (!creds || !verifyOAuthState(dataDir, state, 'gmail') || !code) { res.status(400).send(oauthResultPage('Connexion refusée', 'La demande Google a expiré ou a été annulée.')); return; }
  try {
    const auth = new google.auth.OAuth2(creds.clientId, creds.clientSecret, oauthRedirect('gmail'));
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) throw new Error('missing refresh token');
    writeGmailToken(tokens);
    res.send(oauthResultPage('Gmail est connecté', 'Vous pouvez fermer cet onglet puis actualiser Nohm.'));
  } catch { res.status(502).send(oauthResultPage('Connexion impossible', 'Google n’a pas accepté la connexion. Vérifiez votre client OAuth et son URI de redirection.')); }
});

// Last.fm web auth (auth.getSession). Redirect the user to last.fm to approve, then exchange the
// one-time token for the account name. Needs the app key + secret registered once at
// last.fm/api/account/create; the provider itself only reads with the key + user.
app.get('/api/settings/oauth/lastfm/start', (_req, res) => {
  const creds = lastfmCreds();
  if (!creds) { res.status(409).send(oauthResultPage('Last.fm n’est pas prêt', 'Enregistrez d’abord la clé API et le secret Last.fm.')); return; }
  const cb = `${publicBaseUrl()}/api/settings/oauth/lastfm/callback`;
  res.redirect(`https://www.last.fm/api/auth/?api_key=${encodeURIComponent(creds.apiKey)}&cb=${encodeURIComponent(cb)}`);
});

app.get('/api/settings/oauth/lastfm/callback', async (req, res) => {
  const creds = lastfmCreds();
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!creds || !token) { res.status(400).send(oauthResultPage('Connexion refusée', 'La demande Last.fm est incomplète ou a expiré.')); return; }
  try {
    // api_sig = md5 of the params sorted by name and concatenated as name+value, then + secret.
    const signature = md5Hex(`api_key${creds.apiKey}methodauth.getSessiontoken${token}${creds.secret}`);
    const url = new URL('https://ws.audioscrobbler.com/2.0/');
    url.search = new URLSearchParams({ method: 'auth.getSession', api_key: creds.apiKey, token, api_sig: signature, format: 'json' }).toString();
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    const body = (await response.json()) as { session?: { name?: string }; error?: unknown };
    if (!response.ok || body.error !== undefined || !body.session?.name) throw new Error('lastfm session exchange failed');
    await serviceSettingsStore.set('lastfm', { ...serviceSettingsStore.get('lastfm'), LASTFM_USER: body.session.name });
    res.send(oauthResultPage('Last.fm est connecté', `Compte @${body.session.name} enregistré. Redémarrez Nohm une fois.`));
  } catch {
    res.status(502).send(oauthResultPage('Connexion impossible', 'Last.fm n’a pas validé la connexion. Vérifiez la clé et le secret.'));
  }
});

// GitHub device flow — no callback URL and no client secret. The user registers a minimal OAuth
// app once (only to obtain a client id, which is not a secret), saves it, then "Se connecter"
// shows a short code to type at github.com/login/device and the token lands here. No PAT to paste,
// and the resulting OAuth token works with the events API that fine-grained PATs don't.
const GITHUB_DEVICE_SCOPE = 'repo read:user';

function githubOauthClientId(): string | undefined {
  return serviceSettingsStore.get('github').GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_OAUTH_CLIENT_ID || undefined;
}

app.post('/api/settings/oauth/github/device', async (_req, res) => {
  const clientId = githubOauthClientId();
  if (!clientId) {
    res.status(409).json({ error: 'github-client-id-missing' });
    return;
  }
  try {
    const response = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, scope: GITHUB_DEVICE_SCOPE }),
    });
    const body = (await response.json()) as { device_code?: string; user_code?: string; verification_uri?: string; interval?: number; expires_in?: number };
    if (!response.ok || !body.device_code || !body.user_code || !body.verification_uri) throw new Error('device code request failed');
    res.json({
      deviceCode: body.device_code,
      userCode: body.user_code,
      verificationUri: body.verification_uri,
      interval: body.interval ?? 5,
      expiresIn: body.expires_in ?? 900,
    });
  } catch {
    res.status(502).json({ error: 'github-device-start-failed' });
  }
});

const githubPollSchema = z.object({ deviceCode: z.string().min(1) });

app.post('/api/settings/oauth/github/poll', async (req, res) => {
  const clientId = githubOauthClientId();
  const parsed = githubPollSchema.safeParse(req.body);
  if (!clientId || !parsed.success) {
    res.status(400).json({ error: 'github-poll-invalid' });
    return;
  }
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        device_code: parsed.data.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });
    const body = (await response.json()) as { access_token?: string; error?: string; interval?: number };
    if (body.access_token) {
      const who = await fetch('https://api.github.com/user', {
        headers: { authorization: `Bearer ${body.access_token}`, accept: 'application/vnd.github+json' },
      });
      const user = (await who.json()) as { login?: string };
      if (!who.ok || !user.login) throw new Error('user lookup failed');
      await serviceSettingsStore.set('github', {
        ...serviceSettingsStore.get('github'),
        GITHUB_TOKEN: body.access_token,
        GITHUB_USERNAME: user.login,
      });
      res.json({ status: 'authorized', username: user.login });
      return;
    }
    if (body.error === 'authorization_pending') {
      res.json({ status: 'pending' });
      return;
    }
    if (body.error === 'slow_down') {
      res.json({ status: 'pending', interval: body.interval ?? 10 });
      return;
    }
    res.json({ status: 'error', error: body.error ?? 'unknown' });
  } catch {
    res.status(502).json({ error: 'github-poll-failed' });
  }
});

// Steam OpenID 2.0 — "Se connecter avec Steam" needs no app registration and no API key. Steam
// redirects back with a claimed_id URL ending in the SteamID64; we verify it against Steam and
// store the id (the Web API key is still entered once, separately).
app.get('/api/settings/oauth/steam/start', (_req, res) => {
  const url = new URL('https://steamcommunity.com/openid/login');
  url.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
  url.searchParams.set('openid.mode', 'checkid_setup');
  url.searchParams.set('openid.return_to', `${publicBaseUrl()}/api/settings/oauth/steam/callback`);
  url.searchParams.set('openid.realm', publicBaseUrl());
  url.searchParams.set('openid.identity', 'http://specs.openid.net/auth/2.0/identifier_select');
  url.searchParams.set('openid.claimed_id', 'http://specs.openid.net/auth/2.0/identifier_select');
  res.redirect(url.toString());
});

app.get('/api/settings/oauth/steam/callback', async (req, res) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key.startsWith('openid.') && typeof value === 'string') params.set(key, value);
  }
  const claimed = params.get('openid.claimed_id') ?? '';
  const match = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(claimed);
  if (!match || params.get('openid.mode') !== 'id_res') {
    res.status(400).send(oauthResultPage('Connexion refusée', 'La réponse Steam est incomplète ou a expiré.'));
    return;
  }
  try {
    params.set('openid.mode', 'check_authentication');
    const verify = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const text = await verify.text();
    if (!verify.ok || !/is_valid\s*:\s*true/.test(text)) throw new Error('openid verification failed');
    await serviceSettingsStore.set('steam', { ...serviceSettingsStore.get('steam'), STEAM_ID: match[1] });
    res.send(oauthResultPage('Steam est connecté', `SteamID ${match[1]} enregistré. Ajoutez votre clé Web API si besoin, puis redémarrez Nohm.`));
  } catch {
    res.status(502).send(oauthResultPage('Connexion impossible', 'Steam n’a pas validé la connexion. Réessayez.'));
  }
});

app.put('/api/settings/services/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  if (!isConfigurableServiceId(serviceId)) {
    res.status(404).json({ error: 'unknown-service' });
    return;
  }
  // Merge onto what's already stored so a partial save keeps the fields it left out — the
  // client only sends the fields the user actually typed, so you can change a Riot ID or a
  // player tag without re-pasting the API key that never leaves the server.
  const incoming = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const merged = { ...serviceSettingsStore.get(serviceId), ...incoming };
  const parsed = serviceSettingsSchemas[serviceId].safeParse(merged);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-service-settings' });
    return;
  }
  try {
    await serviceSettingsStore.set(serviceId, parsed.data as Record<string, string>);
    res.json({ ok: true, configured: true, restartRequired: true });
  } catch {
    res.status(500).json({ error: 'settings-save-failed' });
  }
});

// Pushes "widget X settled" to open dashboards so they read it now instead of on their next poll.
const widgetEvents = createWidgetEventStream();
app.get('/api/events', widgetEvents.handler);
scheduler.onSettled((id) => widgetEvents.broadcast(id));

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

app.post('/api/weather/location', async (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-location' });
    return;
  }
  providers.weather.setCoords(parsed.data);
  providers.transit.setCoords(parsed.data);
  providers.power.setCoords(parsed.data);
  await scheduler.refresh('weather'); // refresh() never throws — it stores the failure on the entry
  await scheduler.refresh('transit');
  await scheduler.refresh('power');
  res.json({ ok: true });
});

const hueStateSchema = z
  .object({
    on: z.boolean().optional(),
    brightness: z.number().min(1).max(100).optional(),
  })
  .refine((body) => body.on !== undefined || body.brightness !== undefined, {
    message: 'at least one of on/brightness is required',
  });

app.post('/api/hue/lights/:id', async (req, res) => {
  const parsed = hueStateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-hue-state' });
    return;
  }
  try {
    await providers.hue.setLightState(req.params.id, parsed.data);
  } catch {
    res.status(502).json({ error: 'hue-control-failed' });
    return;
  }
  await scheduler.refresh('hue', true);
  res.json(scheduler.getEnvelope('hue'));
});

const hueGroupSchema = z.object({ on: z.boolean() });

app.post('/api/hue/groups/:id', async (req, res) => {
  const parsed = hueGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-hue-state' });
    return;
  }
  try {
    await providers.hue.setGroupState(req.params.id, parsed.data.on);
  } catch {
    res.status(502).json({ error: 'hue-control-failed' });
    return;
  }
  await scheduler.refresh('hue', true);
  res.json(scheduler.getEnvelope('hue'));
});

app.post('/api/hue/scenes/:id', async (req, res) => {
  try {
    await providers.hue.activateScene(req.params.id);
  } catch {
    res.status(502).json({ error: 'hue-control-failed' });
    return;
  }
  await scheduler.refresh('hue', true);
  res.json(scheduler.getEnvelope('hue'));
});

// Ingest endpoint for an Apple Health Shortcut running on the user's phone (over Tailscale).
// Same trust model as the rest of the dashboard: loopback + `tailscale serve`, no separate auth.
// Accepts either a single day sample or `{ days: [...] }` covering a multi-day window.
app.post('/api/health/ingest', async (req, res) => {
  const samples = parseHealthIngestBody(req.body);
  if (!samples) {
    res.status(400).json({ error: 'invalid-health-sample' });
    return;
  }
  const today = todayInZone(env.timezone);
  for (const sample of samples) {
    await providers.health.ingest(sample, today);
  }
  await scheduler.refresh('health'); // reflect the new samples immediately, not on the next 5-min poll
  await scheduler.refresh('command-center');
  // This dashboard is already up to date; the announcement is for the other installations, which
  // only learn about a write through the database they share.
  await notifyProviderRefresh(database, 'health');
  res.json({ ok: true });
});

const layoutOrderSchema = z.object({
  order: z.array(z.string().min(1)).refine((order) => new Set(order).size === order.length, {
    message: 'order must not contain duplicates',
  }),
});

app.get('/api/layout', (_req, res) => {
  res.json({ layout: layoutStore.getAll() });
});

app.put('/api/layout/:sectionId', (req, res) => {
  const parsed = layoutOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid-layout-order' });
    return;
  }
  layoutStore.set(req.params.sectionId, parsed.data.order);
  res.json({ order: parsed.data.order });
});

app.get('/api/widgets', (_req, res) => {
  res.json({ widgets: scheduler.list() });
});

const gameModeSchema = z.object({ active: z.boolean() });
app.post('/api/game-mode', (req, res) => {
  const parsed = gameModeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid-game-mode' }); return; }
  scheduler.setGameMode(parsed.data.active);
  res.json({ active: parsed.data.active });
});

const ciderCommandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.enum(['play', 'pause', 'previous', 'next', 'toggle-shuffle', 'toggle-repeat']) }),
  z.object({ command: z.literal('seek'), value: z.number().min(0) }),
  z.object({ command: z.literal('volume'), value: z.number().min(0).max(1) }),
]);

app.post('/api/music/cider/command', async (req, res) => {
  const parsed = ciderCommandSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'invalid-music-command' }); return; }
  if (!env.cider) { res.status(409).json({ error: 'cider-not-configured' }); return; }
  try {
    await sendCiderCommand(env.cider, parsed.data.command as CiderCommand, 'value' in parsed.data ? parsed.data.value : undefined);
    await scheduler.refresh('music-cider', true);
    res.json(scheduler.getEnvelope('music-cider'));
  } catch {
    res.status(502).json({ error: 'cider-control-failed' });
  }
});

app.get('/api/widgets/:id', (req, res) => {
  const envelope = scheduler.getEnvelope(req.params.id);
  if (!envelope) {
    res.status(404).json({ error: 'unknown-widget' });
    return;
  }
  res.json(envelope);
});

app.get('/api/github/repos', async (_req, res) => {
  if (!env.github) {
    res.status(503).json({ error: 'github-not-configured' });
    return;
  }
  try {
    const { repos, stale } = await ownedReposCache(env.github);
    if (stale) console.warn('[github/repos] serving cached repositories after upstream failure');
    res.json({ repos });
  } catch (error) {
    // Never log the raw error here — it can carry the auth token in its request URL/headers.
    const status = typeof error === 'object' && error !== null && 'status' in error ? (error as { status?: unknown }).status : undefined;
    const statusLabel = typeof status === 'number' || typeof status === 'string' ? String(status) : 'unknown';
    console.error(`[github/repos] failed (status ${statusLabel})`);
    res.status(502).json({ error: 'github-repos-failed' });
  }
});

app.post('/api/github/issues', async (req, res) => {
  if (!env.githubIssuesToken || !env.github) {
    res.status(503).json({ error: 'github-issues-not-configured' });
    return;
  }
  try {
    const allowedRepos = await listOwnedRepos(env.github);
    const issue = parseIssueInput(req.body, allowedRepos);
    res.status(201).json(await createIssue(env.githubIssuesToken, issue));
  } catch (error) {
    const code = issueErrorCode(error);
    if (code === 'github-write-failed') console.error(`[github/issues] failed (${code})`);
    res.status(code === 'invalid-issue' || code === 'repo-not-allowed' ? 400 : 502).json({ error: code });
  }
});

app.get('/api/code/projects', (_req, res) => res.json({ projects: availableProjects(config) }));

app.post('/api/code/actions', async (req, res) => {
  try {
    await launchCodeAction(req.body, config);
    res.status(204).end();
  } catch (error) {
    const code = codeActionError(error);
    res.status(code === 'invalid-code-action' || code === 'project-not-configured' ? 400 : 502).json({ error: code });
  }
});

app.post('/api/widgets/:id/refresh', async (req, res) => {
  // Any registered widget can be force-refreshed — the "Vérifier" button in Settings and the
  // AI-usage refresh buttons both hit this. refresh() never throws; it stores the outcome on
  // the entry, so the envelope we return already reflects success or the sanitized failure.
  if (!scheduler.getEnvelope(req.params.id)) {
    res.status(404).json({ error: 'unknown-widget' });
    return;
  }
  await scheduler.refresh(req.params.id, true);
  res.json(scheduler.getEnvelope(req.params.id));
});

if (env.isProduction) {
  const dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// A Shortcut posting to the always-on ingest service, or a GitHub webhook reaching it, writes to
// the shared database without this process noticing until that provider's next poll.
await listenForProviderRefresh(database, (providerId) => {
  // No id means "you reconnected and may have missed an announcement". Refreshing everything would
  // kick off expensive probes (the Claude PTY one alone can take 35s), so refresh only the
  // providers an outside writer can actually change.
  for (const id of providerId ? [providerId] : EXTERNALLY_WRITTEN_PROVIDER_IDS) {
    void scheduler.refresh(id);
  }
  void scheduler.refresh('command-center');
}).catch((error) => {
  console.error('[refresh] announcements unavailable, falling back to polling:', error);
});

const server = app.listen(env.port, env.host, () => {
  console.log(`Dashboard server on http://${env.host}:${env.port} (${env.timezone})`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${env.port} is already in use — a stale server process is likely still running. ` +
        `Run \`lsof -ti tcp:${env.port} | xargs kill\` and restart.`,
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});

async function closeDatabase(): Promise<void> {
  scheduler.stop();
  await database.client.end({ timeout: 5 });
}

process.once('SIGINT', () => void closeDatabase().finally(() => process.exit(0)));
process.once('SIGTERM', () => void closeDatabase().finally(() => process.exit(0)));
