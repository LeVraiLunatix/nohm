import { robloxSchema, type RobloxData } from '@nohm/shared';
import type { Provider } from '../scheduler.js';

export interface RobloxAuth {
  idOrUsername: string;
  robloSecurity?: string;
}

/** Roblox's presence status codes: 0 offline, 1 online, 2 in-game, 3 in-studio. */
const PRESENCE_STATUS = ['offline', 'online', 'in-game', 'in-studio'] as const;

class RobloxHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function robloxGet<T>(signal: AbortSignal, url: string, label: string, robloSecurity?: string): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: robloSecurity ? { Cookie: `.ROBLOSECURITY=${robloSecurity}` } : undefined,
  });
  if (!res.ok) throw new RobloxHttpError(`Roblox ${label} failed: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Roblox requires a CSRF handshake for authenticated POSTs: the first request (with no token) is
 * rejected with 403 and an `x-csrf-token` response header, which is then replayed on a retry. Never
 * logs the cookie or any header — only the label and status code, matching the sanitization the
 * rest of the codebase applies to authenticated providers. */
async function robloxAuthedPost<T>(
  signal: AbortSignal,
  robloSecurity: string,
  url: string,
  body: unknown,
  label: string,
): Promise<T> {
  const baseHeaders = { 'Content-Type': 'application/json', Cookie: `.ROBLOSECURITY=${robloSecurity}` };
  const attempt = async (csrfToken?: string) =>
    fetch(url, {
      method: 'POST',
      signal,
      headers: csrfToken ? { ...baseHeaders, 'x-csrf-token': csrfToken } : baseHeaders,
      body: JSON.stringify(body),
    });

  let res = await attempt();
  if (res.status === 403) {
    const csrfToken = res.headers.get('x-csrf-token');
    if (!csrfToken) throw new RobloxHttpError(`Roblox ${label} CSRF handshake failed`, 403);
    res = await attempt(csrfToken);
  }
  if (!res.ok) throw new RobloxHttpError(`Roblox ${label} failed: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

/** Unlike the CSRF-guarded authenticated endpoints, username lookup is a public POST — no
 * cookie, no CSRF handshake. */
async function robloxPost<T>(signal: AbortSignal, url: string, body: unknown, label: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new RobloxHttpError(`Roblox ${label} failed: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

export async function resolveUserId(signal: AbortSignal, idOrUsername: string): Promise<number> {
  if (/^\d+$/.test(idOrUsername)) return Number(idOrUsername);
  const data = await robloxPost<{ data: { id: number }[] }>(
    signal,
    'https://users.roblox.com/v1/usernames/users',
    { usernames: [idOrUsername], excludeBannedUsers: false },
    'username lookup',
  );
  const match = data.data[0];
  if (!match) throw new Error('Roblox username lookup returned no match');
  return match.id;
}

type FetchResult<T> = { status: 'available'; data: T } | { status: 'unavailable' | 'unauthorized' };

function toFetchStatus(err: unknown): 'unavailable' | 'unauthorized' {
  return err instanceof RobloxHttpError && (err.status === 401 || err.status === 403) ? 'unauthorized' : 'unavailable';
}

interface GameContext {
  iconUrl?: string;
  thumbnailUrl?: string;
  playing?: number;
  visits?: number;
}

/** Best-effort context for the currently-played universe — art (a square icon for tile-sized
 * rendering, a wide thumbnail for hero/secondary-sized rendering) plus live stats (concurrent
 * players, total visits) to give the card something to show beyond just a name. Failures here
 * shouldn't take down presence itself, so each call is caught independently. */
async function fetchGameContext(signal: AbortSignal, universeId: number): Promise<GameContext> {
  const [iconUrl, thumbnailUrl, stats] = await Promise.all([
    robloxGet<{ data: { targetId: number; imageUrl?: string }[] }>(
      signal,
      `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=150x150&format=Png`,
      'GetGameIcon',
    ).then((res) => res.data[0]?.imageUrl).catch(() => undefined),
    robloxGet<{ data: { universeId: number; thumbnails: { imageUrl?: string }[] }[] }>(
      signal,
      `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${universeId}&countPerUniverse=1&size=768x432&format=Png`,
      'GetGameThumbnail',
    ).then((res) => res.data[0]?.thumbnails[0]?.imageUrl).catch(() => undefined),
    robloxGet<{ data: { playing?: number; visits?: number }[] }>(
      signal,
      `https://games.roblox.com/v1/games?universeIds=${universeId}`,
      'GetGameStats',
    ).then((res) => ({ playing: res.data[0]?.playing, visits: res.data[0]?.visits }))
      .catch(() => ({ playing: undefined, visits: undefined })),
  ]);
  return { iconUrl, thumbnailUrl, playing: stats.playing, visits: stats.visits };
}

/** Roblox sends these as explicit `null` (not omitted) whenever they don't apply — e.g. every
 * field here is null when you're not currently in a game. */
interface RawPresenceEntry {
  userPresenceType: number;
  lastLocation?: string | null;
  lastOnline?: string | null;
  rootPlaceId?: number | null;
  universeId?: number | null;
}

async function fetchPresence(signal: AbortSignal, userId: number, robloSecurity: string): Promise<FetchResult<RobloxData['presence']>> {
  try {
    const data = await robloxAuthedPost<{ userPresences: RawPresenceEntry[] }>(
      signal,
      robloSecurity,
      'https://presence.roblox.com/v1/presence/users',
      { userIds: [userId] },
      'GetPresence',
    );
    const entry = data.userPresences[0];
    if (!entry) return { status: 'unavailable' };
    const status = PRESENCE_STATUS[entry.userPresenceType] ?? 'offline';
    const universeId = entry.universeId ?? undefined;
    const context: GameContext = status === 'in-game' && universeId !== undefined
      ? await fetchGameContext(signal, universeId)
      : {};
    return {
      status: 'available',
      data: {
        status,
        gameName: entry.lastLocation ?? undefined,
        lastOnline: entry.lastOnline ?? undefined,
        placeId: entry.rootPlaceId ?? undefined,
        iconUrl: context.iconUrl,
        thumbnailUrl: context.thumbnailUrl,
        playing: context.playing,
        visits: context.visits,
      },
    };
  } catch (err) {
    return { status: toFetchStatus(err) };
  }
}

export function createRobloxProvider(auth: RobloxAuth | undefined): Provider<RobloxData> {
  return {
    id: 'roblox',
    schema: robloxSchema,
    refreshMs: 5 * 60_000,
    timeoutMs: 15_000,
    // Presence needs the session cookie — without it there's nothing for this provider to show.
    isConfigured: () => auth?.robloSecurity !== undefined,
    async fetch(signal) {
      if (!auth?.robloSecurity) throw new Error('roblox is not configured');

      const userId = await resolveUserId(signal, auth.idOrUsername);
      const presence = await fetchPresence(signal, userId, auth.robloSecurity);

      const data: RobloxData = {
        presence: presence.status === 'available' ? presence.data : null,
        availability: presence.status,
      };

      return robloxSchema.parse(data);
    },
  };
}
