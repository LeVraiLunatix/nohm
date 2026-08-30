import 'dotenv/config';
import { createHmac } from 'node:crypto';

export interface ServerEnv {
  port: number;
  host: string;
  timezone: string;
  isProduction: boolean;
  /** Public origin the dashboard is reached at (e.g. a `tailscale serve` hostname). OAuth
      callbacks are built against this when set, so "Se connecter" works from a phone. */
  publicUrl?: string;
  /** Optional: enables persistent cross-machine history through PostgreSQL. */
  databaseUrl?: string;
  weather?: { lat: number; lon: number };
  github?: { token: string; username: string };
  githubIssuesToken?: string;
  icloud?: { username: string; password: string };
  calendarIcsFeeds: { name: string; url: string }[];
  google?: { clientId: string; clientSecret: string };
  spotify?: { clientId: string; clientSecret: string };
  cider?: { baseUrl: string; token?: string };
  lastfm?: { apiKey: string; user: string };
  hue?: { clientId: string; clientSecret: string };
  steam?: { apiKey: string; steamId: string };
  clashRoyale?: { apiKey: string; playerTag: string };
  clashOfClans?: { apiKey: string; playerTag: string };
  roblox?: { idOrUsername: string; robloSecurity?: string };
  valorant?: { apiKey: string; name: string; tag: string; region: string };
  sonarCloud?: { token: string; orgKey: string };
  dashboardPush?: { url: string; secret: string };
}

/**
 * Public or tokenised calendar subscriptions do not always appear in iCloud's
 * CalDAV collection list, so keep their URLs in the ignored environment file.
 */
export function parseCalendarIcsFeeds(raw = process.env.CALENDAR_ICS_FEEDS): ServerEnv['calendarIcsFeeds'] {
  if (!raw) return [];
  try {
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error('must be a JSON array');
    return entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const { name, url } = entry as { name?: unknown; url?: unknown };
      if (typeof name !== 'string' || !name.trim() || typeof url !== 'string') return [];
      try {
        if (new URL(url).protocol !== 'https:') return [];
      } catch {
        return [];
      }
      return [{ name: name.trim(), url }];
    });
  } catch {
    console.warn('⚠️  CALENDAR_ICS_FEEDS must be a JSON array of HTTPS calendar feeds — skipping.');
    return [];
  }
}

function parseWeather(): ServerEnv['weather'] {
  const lat = Number(process.env.WEATHER_LAT);
  const lon = Number(process.env.WEATHER_LON);
  if (!process.env.WEATHER_LAT || !process.env.WEATHER_LON) return undefined;
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    console.warn('⚠️  WEATHER_LAT/WEATHER_LON are not valid numbers — weather disabled.');
    return undefined;
  }
  return { lat, lon };
}

export function parseSteam(): ServerEnv['steam'] {
  const apiKey = process.env.STEAM_API_KEY;
  const steamId = process.env.STEAM_ID;
  if (!apiKey || !steamId) return undefined;
  if (!/^\d{17}$/.test(steamId)) {
    console.warn('⚠️  STEAM_ID is not a numeric SteamID64 (17 digits) — Steam disabled.');
    return undefined;
  }
  return { apiKey, steamId };
}

export function parseClashRoyale(): ServerEnv['clashRoyale'] {
  const apiKey = process.env.CLASH_ROYALE_API_KEY;
  const playerTag = process.env.CLASH_ROYALE_ID;
  if (!apiKey || !playerTag) return undefined;
  return { apiKey, playerTag };
}

export function parseClashOfClans(): ServerEnv['clashOfClans'] {
  const apiKey = process.env.CLASH_OF_CLANS_API_KEY;
  const playerTag = process.env.CLASH_OF_CLANS_ID;
  if (!apiKey || !playerTag) return undefined;
  return { apiKey, playerTag };
}

export function parseRoblox(): ServerEnv['roblox'] {
  const idOrUsername = process.env.ROBLOX_ID;
  if (!idOrUsername) return undefined;
  return { idOrUsername, robloSecurity: process.env.ROBLOSECURITY || undefined };
}

export function parseValorant(): ServerEnv['valorant'] {
  const apiKey = process.env.HENRIKDEV_API_KEY;
  const riotId = process.env.RIOT_ID;
  if (!apiKey || !riotId) return undefined;
  const [name, tag] = riotId.split('#');
  if (!name || !tag) {
    console.warn('⚠️  RIOT_ID must be in "Name#Tag" form — Valorant disabled.');
    return undefined;
  }
  return { apiKey, name, tag, region: process.env.RIOT_REGION || 'eu' };
}

export function parseSonarCloud(): ServerEnv['sonarCloud'] {
  const token = process.env.SONARCLOUD_TOKEN;
  const orgKey = process.env.SONARCLOUD_ORG;
  if (!token || !orgKey) return undefined;
  return { token, orgKey };
}

export function parseDashboardPush(): ServerEnv['dashboardPush'] {
  const url = process.env.DASHBOARD_PUSH_URL;
  const secret = process.env.DASHBOARD_PUSH_SECRET;
  if (!url || !secret) return undefined;
  return { url, secret };
}

export function parseCider(): ServerEnv['cider'] {
  const token = process.env.CIDER_RPC_TOKEN || undefined;
  const unauthenticated = process.env.CIDER_RPC_UNAUTHENTICATED === '1';
  if (!token && !unauthenticated) return undefined;
  const raw = process.env.CIDER_RPC_URL ?? 'http://127.0.0.1:10767';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      console.warn('⚠️  CIDER_RPC_URL must be an HTTP loopback URL — Cider disabled.');
      return undefined;
    }
    return { baseUrl: url.origin, token };
  } catch {
    console.warn('⚠️  CIDER_RPC_URL is invalid — Cider disabled.');
    return undefined;
  }
}

export function parseLastFm(): ServerEnv['lastfm'] {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  const user = process.env.LASTFM_USER?.trim();
  if (!apiKey || !user) return undefined;
  return { apiKey, user };
}

export function parsePublicUrl(): string | undefined {
  const raw = process.env.NOHM_PUBLIC_URL?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // Strip any path/query/trailing slash — callbacks are appended to the bare origin.
    return url.origin;
  } catch {
    console.warn('⚠️  NOHM_PUBLIC_URL is not a valid URL — falling back to loopback for OAuth callbacks.');
    return undefined;
  }
}

/** Matches Batabiboing's derived token so a feed URL cannot authenticate its push endpoint. */
export function batabiboingCalendarFeed(
  pushUrl: string,
  pushSecret: string,
): { name: string; url: string } | undefined {
  try {
    const url = new URL(pushUrl);
    let pathname = url.pathname;
    while (pathname.endsWith('/')) pathname = pathname.slice(0, -1);
    if (url.protocol !== 'https:' || pathname !== '/api/push') return undefined;
    const token = createHmac('sha256', pushSecret).update('calendar-feed-v1').digest('base64url');
    url.pathname = '/api/calendar';
    url.search = '';
    url.searchParams.set('token', token);
    return { name: 'Batabiboing', url: url.toString() };
  } catch {
    return undefined;
  }
}

export function loadEnv(): ServerEnv {
  const databaseUrl = process.env.DATABASE_URL;
  const host = process.env.HOST ?? '127.0.0.1';
  const dashboardPush = parseDashboardPush();
  if (host !== '127.0.0.1' && host !== 'localhost') {
    console.warn(
      `⚠️  HOST=${host} exposes the dashboard WITHOUT authentication on your network. ` +
        'The intended setup is loopback + `tailscale serve 4821`.',
    );
  }
  return {
    port: Number(process.env.PORT ?? 4821),
    host,
    timezone: process.env.DASHBOARD_TIMEZONE ?? 'Europe/Oslo',
    isProduction: process.env.NODE_ENV === 'production',
    publicUrl: parsePublicUrl(),
    databaseUrl,
    weather: parseWeather(),
    github:
      process.env.GITHUB_TOKEN && process.env.GITHUB_USERNAME
        ? { token: process.env.GITHUB_TOKEN, username: process.env.GITHUB_USERNAME }
        : undefined,
    githubIssuesToken: process.env.GITHUB_ISSUES_TOKEN || undefined,
    icloud:
      process.env.ICLOUD_USERNAME && process.env.ICLOUD_APP_PASSWORD
        ? {
            username: process.env.ICLOUD_USERNAME,
            password: process.env.ICLOUD_APP_PASSWORD,
          }
        : undefined,
    calendarIcsFeeds: [
      ...parseCalendarIcsFeeds(),
      ...(dashboardPush ? [batabiboingCalendarFeed(dashboardPush.url, dashboardPush.secret)].filter(
        (feed): feed is { name: string; url: string } => feed !== undefined,
      ) : []),
    ],
    google:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }
        : undefined,
    spotify:
      process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
        ? {
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
          }
        : undefined,
    cider: parseCider(),
    lastfm: parseLastFm(),
    hue:
      process.env.HUE_CLIENT_ID && process.env.HUE_CLIENT_SECRET
        ? { clientId: process.env.HUE_CLIENT_ID, clientSecret: process.env.HUE_CLIENT_SECRET }
        : undefined,
    steam: parseSteam(),
    clashRoyale: parseClashRoyale(),
    clashOfClans: parseClashOfClans(),
    roblox: parseRoblox(),
    valorant: parseValorant(),
    sonarCloud: parseSonarCloud(),
    dashboardPush,
  };
}
