import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
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

const serviceSettingsStore = new ServiceSettingsStore(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.data/service-settings.json'),
);
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

const AI_USAGE_WIDGET_IDS = new Set(['ai-usage-claude', 'ai-usage-codex']);

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

app.get('/api/settings/services', (_req, res) => {
  res.json({ configured: configuredServiceIds(), oauthReady: [env.google ? 'gmail' : null, env.spotify ? 'spotify' : null].filter(Boolean) });
});

const oauthStates = new Map<string, { service: 'gmail' | 'spotify'; expiresAt: number }>();
const oauthRedirect = (service: 'gmail' | 'spotify') => `http://127.0.0.1:${env.port}/api/settings/oauth/${service}/callback`;
const oauthResultPage = (title: string, detail: string) => `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#090a10;color:#f6f5fb;font:16px system-ui}.card{max-width:34rem;margin:1rem;padding:2rem;border:1px solid #292b38;border-radius:24px;background:#12131c;box-shadow:0 24px 80px #0008}h1{margin:0 0 .6rem;font-size:1.6rem}p{color:#aaaebe;line-height:1.5}button{border:0;border-radius:12px;padding:.7rem 1rem;background:#736bff;color:white;font-weight:700;cursor:pointer}</style><main class="card"><h1>${title}</h1><p>${detail}</p><button onclick="window.close()">Fermer cet onglet</button></main></html>`;

app.get('/api/settings/oauth/spotify/start', (_req, res) => {
  if (!env.spotify) { res.status(409).send(oauthResultPage('Spotify n’est pas prêt', 'Enregistrez d’abord l’ID client et le secret, puis redémarrez Nohm.')); return; }
  const state = randomBytes(24).toString('base64url');
  oauthStates.set(state, { service: 'spotify', expiresAt: Date.now() + 10 * 60_000 });
  const url = new URL('https://accounts.spotify.com/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', env.spotify.clientId);
  url.searchParams.set('scope', 'user-read-currently-playing user-read-recently-played user-top-read');
  url.searchParams.set('redirect_uri', oauthRedirect('spotify'));
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/api/settings/oauth/spotify/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const entry = oauthStates.get(state);
  oauthStates.delete(state);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!env.spotify || !entry || entry.service !== 'spotify' || entry.expiresAt < Date.now() || !code) { res.status(400).send(oauthResultPage('Connexion refusée', 'La demande Spotify a expiré ou a été annulée.')); return; }
  try {
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${env.spotify.clientId}:${env.spotify.clientSecret}`).toString('base64')}` }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: oauthRedirect('spotify') }) });
    const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!response.ok || !token.access_token || !token.refresh_token || !token.expires_in) throw new Error('token exchange failed');
    writeSpotifyToken({ access_token: token.access_token, refresh_token: token.refresh_token, expires_at: Date.now() + token.expires_in * 1000 });
    res.send(oauthResultPage('Spotify est connecté', 'Vous pouvez fermer cet onglet puis actualiser Nohm.'));
  } catch { res.status(502).send(oauthResultPage('Connexion impossible', 'Spotify n’a pas accepté la connexion. Vérifiez l’URI de redirection dans votre application Spotify.')); }
});

app.get('/api/settings/oauth/gmail/start', (_req, res) => {
  if (!env.google) { res.status(409).send(oauthResultPage('Gmail n’est pas prêt', 'Enregistrez d’abord l’ID client et le secret, puis redémarrez Nohm.')); return; }
  const state = randomBytes(24).toString('base64url');
  oauthStates.set(state, { service: 'gmail', expiresAt: Date.now() + 10 * 60_000 });
  const auth = new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, oauthRedirect('gmail'));
  res.redirect(auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', state, scope: ['https://www.googleapis.com/auth/gmail.metadata'] }));
});

app.get('/api/settings/oauth/gmail/callback', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const entry = oauthStates.get(state);
  oauthStates.delete(state);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!env.google || !entry || entry.service !== 'gmail' || entry.expiresAt < Date.now() || !code) { res.status(400).send(oauthResultPage('Connexion refusée', 'La demande Google a expiré ou a été annulée.')); return; }
  try {
    const auth = new google.auth.OAuth2(env.google.clientId, env.google.clientSecret, oauthRedirect('gmail'));
    const { tokens } = await auth.getToken(code);
    if (!tokens.refresh_token) throw new Error('missing refresh token');
    writeGmailToken(tokens);
    res.send(oauthResultPage('Gmail est connecté', 'Vous pouvez fermer cet onglet puis actualiser Nohm.'));
  } catch { res.status(502).send(oauthResultPage('Connexion impossible', 'Google n’a pas accepté la connexion. Vérifiez votre client OAuth et son URI de redirection.')); }
});

app.put('/api/settings/services/:serviceId', async (req, res) => {
  const { serviceId } = req.params;
  if (!isConfigurableServiceId(serviceId)) {
    res.status(404).json({ error: 'unknown-service' });
    return;
  }
  const parsed = serviceSettingsSchemas[serviceId].safeParse(req.body);
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
  if (!AI_USAGE_WIDGET_IDS.has(req.params.id)) {
    res.status(404).json({ error: 'refresh-not-supported' });
    return;
  }

  await scheduler.refresh(req.params.id, true);
  const envelope = scheduler.getEnvelope(req.params.id);
  if (!envelope) {
    res.status(404).json({ error: 'unknown-widget' });
    return;
  }
  res.json(envelope);
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
