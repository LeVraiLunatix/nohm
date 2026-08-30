import { spotifySchema, type SpotifyData } from '@nohm/shared';
import { readSpotifyToken, writeSpotifyToken } from '../spotifyToken.js';
import { SpotifySnapshotStore } from '../spotifyCache.js';
import { SpotifyHistoryStore, type AlbumDetailInput, type PlayedTrackInput } from '../spotifyHistory/index.js';
import type { Provider } from '../scheduler.js';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
// Playback needs to feel live; affinity rankings do not. Refreshing top lists twice daily keeps
// the dashboard useful without repeatedly burning through Spotify's development-app quota.
const TOP_DATA_REFRESH_MS = 12 * 60 * 60_000;
const TOP_TRACK_HISTORY_LIMIT = 100;
const DEFAULT_RATE_LIMIT_RETRY_MS = 30_000;
const RECENT_RECONCILIATION_MS = 15 * 60_000;
const IDLE_PLAYBACK_CHECK_MS = 5 * 60_000;
const PLAYBACK_FINISH_GRACE_MS = 1_000;
const MIN_PLAYBACK_CHECK_MS = 5_000;
const FAILURE_RETRY_MS = 60_000;

// Raw Spotify shapes (only the fields we read).
interface RawImage {
  url: string;
}
interface RawArtist {
  id: string;
  name: string;
  images?: RawImage[];
  genres?: string[];
  external_urls?: { spotify?: string };
}
export interface RawTrack {
  id: string;
  name: string;
  duration_ms?: number;
  artists: { id: string; name: string }[];
  album?: {
    id: string;
    name?: string;
    artists?: { id: string; name: string }[];
    album_type?: string;
    images?: RawImage[];
    release_date?: string;
    release_date_precision?: string;
    total_tracks?: number;
    external_urls?: { spotify?: string };
  };
  external_urls?: { spotify?: string };
}
interface RawAlbumTrack {
  id?: string;
  duration_ms?: number;
  artists?: { id: string }[];
}
interface RawAlbumDetail {
  id: string;
  total_tracks?: number;
  release_date_precision?: string;
  album_type?: string;
  tracks?: { items?: RawAlbumTrack[] };
}
interface CurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number | null;
  item: RawTrack | null;
}
interface RecentlyPlayed {
  items: { track: RawTrack; played_at: string }[];
}
interface TopResponse<T> {
  items: T[];
}

interface TopData {
  artistsShort: RawArtist[];
  artistsMedium: RawArtist[];
  artistsLong: RawArtist[];
  tracksShort: RawTrack[];
  tracksMedium: RawTrack[];
  tracksLong: RawTrack[];
}

const firstImage = (images?: RawImage[]) => images?.[0]?.url;

function toReleaseDatePrecision(precision?: string): 'year' | 'month' | 'day' | undefined {
  return precision === 'year' || precision === 'month' || precision === 'day' ? precision : undefined;
}

function toAlbumType(type?: string): 'album' | 'single' | 'compilation' | undefined {
  return type === 'album' || type === 'single' || type === 'compilation' ? type : undefined;
}

function toAlbumTrackInput(track: RawAlbumTrack): { id: string; artistIds: string[] } | undefined {
  if (!track.id) return undefined;
  return { id: track.id, artistIds: (track.artists ?? []).map((artist) => artist.id) };
}

function toAlbumDetailInput(album: RawAlbumDetail): AlbumDetailInput {
  const tracks = album.tracks?.items ?? [];
  return {
    id: album.id,
    totalDurationMs: tracks.reduce((sum, track) => sum + (track.duration_ms ?? 0), 0),
    totalTracks: album.total_tracks,
    releaseDatePrecision: toReleaseDatePrecision(album.release_date_precision),
    albumType: toAlbumType(album.album_type),
    tracks: tracks
      .map(toAlbumTrackInput)
      .filter((track): track is { id: string; artistIds: string[] } => track !== undefined),
  };
}

function mapTrack(track: RawTrack) {
  return {
    id: track.id,
    track: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.album?.name,
    releaseDate: track.album?.release_date,
    durationMs: track.duration_ms,
    imageUrl: firstImage(track.album?.images),
    url: track.external_urls?.spotify,
  };
}

function mapArtist(artist: RawArtist) {
  return {
    id: artist.id,
    name: artist.name,
    imageUrl: firstImage(artist.images),
    url: artist.external_urls?.spotify,
    genres: artist.genres ?? [],
  };
}

/** Shapes a raw track for history recording/seeding — undefined for tracks missing the ids we need to dedupe on (e.g. local files). */
export function toPlayedTrackInput(track: RawTrack): PlayedTrackInput | undefined {
  if (!track.id || !track.album?.id) return undefined;
  return {
    id: track.id,
    name: track.name,
    url: track.external_urls?.spotify,
    durationMs: track.duration_ms,
    artists: track.artists.map((a) => ({ id: a.id, name: a.name })),
    album: {
      id: track.album.id,
      name: track.album.name ?? 'Unknown album',
      artist: (track.album.artists?.length ? track.album.artists : track.artists).map((artist) => artist.name).join(', '),
      imageUrl: firstImage(track.album.images),
      url: track.album.external_urls?.spotify,
      releaseDate: track.album.release_date,
      releaseDatePrecision: toReleaseDatePrecision(track.album.release_date_precision),
      totalTracks: track.album.total_tracks,
      albumType: toAlbumType(track.album.album_type),
    },
  };
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('spotify rate limited');
}

type SpotifyGet = <T>(path: string) => Promise<T | null>;

function createSpotifyGet(
  initialBearer: string,
  signal: AbortSignal,
  snapshotStore: SpotifySnapshotStore,
  refreshBearer: () => Promise<string>,
): SpotifyGet {
  let bearer = initialBearer;
  return async <T>(path: string): Promise<T | null> => {
    const retryInMs = await snapshotStore.getRateLimitedUntil() - Date.now();
    if (retryInMs > 0) {
      throw new Error(`spotify rate limited; retry in ${Math.ceil(retryInMs / 1000)} seconds`);
    }
    const request = () => fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${bearer}` },
      signal,
    });
    let res = await request();
    // An access token can become invalid before its recorded expiry (for example after a
    // Spotify session revocation). Refresh and retry this one request before marking the
    // whole provider unavailable. A second 401 still surfaces normally and needs reconnecting.
    if (res.status === 401) {
      bearer = await refreshBearer();
      res = await request();
    }
    if (res.status === 204) return null; // e.g. nothing currently playing
    if (res.status === 429) {
      const retryAfterSeconds = Number(res.headers.get('retry-after'));
      const retryAfterMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? retryAfterSeconds * 1000
          : DEFAULT_RATE_LIMIT_RETRY_MS;
      await snapshotStore.setRateLimitedUntil(Date.now() + retryAfterMs);
      throw new Error(`spotify rate limited; retry in ${Math.ceil(retryAfterMs / 1000)} seconds`);
    }
    // A 403 on a correctly-scoped call almost always means the Spotify app is still in
    // Development Mode and this account isn't on its allowlist (Dashboard → your app →
    // Settings → User Management → add the email). OAuth succeeds regardless, so the failure
    // only shows up here on the first real request.
    if (res.status === 403) {
      throw new Error(
        `spotify ${path} failed: 403 — add your account under the app's User Management (Development Mode allowlist), then reconnect`,
      );
    }
    if (!res.ok) throw new Error(`spotify ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  };
}

/**
 * Returns a valid access token, refreshing (and re-persisting) via the stored
 * refresh_token when the current one is within a minute of expiry. Never logs
 * response bodies — Spotify's token responses carry the tokens themselves.
 */
export async function accessToken(
  oauth: { clientId: string; clientSecret: string },
  signal: AbortSignal,
  forceRefresh = false,
): Promise<string> {
  const token = readSpotifyToken();
  if (!token) throw new Error('spotify is not configured');
  if (!forceRefresh && token.expires_at - Date.now() > 60_000) return token.access_token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' + Buffer.from(`${oauth.clientId}:${oauth.clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`spotify token refresh failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
  };
  // Spotify may omit refresh_token on refresh — keep the existing one when it does.
  const next = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
  };
  writeSpotifyToken(next);
  return next.access_token;
}

/** Spotify caps `limit` at 50/call for top-items endpoints, so paginate with `offset` to get more. */
async function getTopTracks(
  get: <T>(path: string) => Promise<T | null>,
  timeRange: 'short_term' | 'medium_term' | 'long_term',
  total: number,
): Promise<RawTrack[]> {
  const pageSize = 50;
  const results: RawTrack[] = [];
  for (let offset = 0; offset < total; offset += pageSize) {
    const limit = Math.min(pageSize, total - offset);
    const page = await get<TopResponse<RawTrack>>(
      `/me/top/tracks?time_range=${timeRange}&limit=${limit}&offset=${offset}`,
    );
    const items = page?.items ?? [];
    results.push(...items);
    if (items.length < limit) break; // fewer than requested means there's nothing more to page through
  }
  return results;
}

/**
 * Runs the bounded top-list work serially. A fresh process used to fan out dozens of
 * paginated requests at once, which is precisely what triggers long Spotify cooldowns.
 */
async function refreshTopData(get: SpotifyGet, historyStore: SpotifyHistoryStore): Promise<TopData> {
  const artistsShort = await get<TopResponse<RawArtist>>('/me/top/artists?time_range=short_term&limit=8');
  const artistsMedium = await get<TopResponse<RawArtist>>('/me/top/artists?time_range=medium_term&limit=8');
  const artistsLong = await get<TopResponse<RawArtist>>('/me/top/artists?time_range=long_term&limit=8');
  const tracksShort = await getTopTracks(get, 'short_term', TOP_TRACK_HISTORY_LIMIT);
  const tracksMedium = await getTopTracks(get, 'medium_term', TOP_TRACK_HISTORY_LIMIT);
  const tracksLong = await getTopTracks(get, 'long_term', TOP_TRACK_HISTORY_LIMIT);
  const topData: TopData = {
    artistsShort: artistsShort?.items ?? [],
    artistsMedium: artistsMedium?.items ?? [],
    artistsLong: artistsLong?.items ?? [],
    tracksShort,
    tracksMedium,
    tracksLong,
  };

  // One-time backfill from Spotify's long_term (~12 months) top lists, so all-time stats
  // aren't empty on day one — real observed plays accrue on top from here.
  if (!(await historyStore.isSeeded())) {
    const artistsLongSeed = await get<TopResponse<RawArtist>>('/me/top/artists?time_range=long_term&limit=50');
    await historyStore.seedIfNeeded({
      artists: (artistsLongSeed?.items ?? []).map(mapArtist),
      tracks: topData.tracksLong
        .map(toPlayedTrackInput)
        .filter((t): t is PlayedTrackInput => t !== undefined),
    });
  }

  // Album enrichment is useful metadata, but never worth spending live-playback quota on.
  const pendingAlbumIds = await historyStore.getAlbumIdsNeedingDurations(5);
  const enrichments: AlbumDetailInput[] = [];
  for (const id of pendingAlbumIds) {
    const album = await get<RawAlbumDetail>(`/albums/${id}`).catch(() => null);
    if (album) enrichments.push(toAlbumDetailInput(album));
  }
  await historyStore.enrichAlbumDetails(enrichments);

  await historyStore.mergeArtistMetadata(
    [...topData.artistsShort, ...topData.artistsMedium].map(mapArtist),
  );
  await historyStore.healTrackMetadata(
    [...topData.tracksShort, ...topData.tracksMedium, ...topData.tracksLong]
      .map(toPlayedTrackInput)
      .filter((t): t is PlayedTrackInput => t !== undefined),
  );
  await historyStore.discoverTracks(
    [...topData.tracksShort, ...topData.tracksMedium, ...topData.tracksLong]
      .map(toPlayedTrackInput)
      .filter((t): t is PlayedTrackInput => t !== undefined),
  );

  return topData;
}

function pickTopList<T>(fresh: T[] | undefined, previous: T[] | undefined): T[] {
  return fresh?.length ? fresh : previous ?? [];
}

async function recordRecentPlays(recent: RecentlyPlayed, historyStore: SpotifyHistoryStore): Promise<void> {
  const recentPlays = recent.items
    .map((entry) => {
      const track = toPlayedTrackInput(entry.track);
      return track ? { playedAt: entry.played_at, track } : undefined;
    })
    .filter((e): e is { playedAt: string; track: PlayedTrackInput } => e !== undefined);
  await historyStore.recordPlays(recentPlays);
}

function buildSnapshot(
  current: CurrentlyPlaying | null,
  recent: RecentlyPlayed | null | undefined,
  previousSnapshot: SpotifyData | undefined,
  topData: TopData | undefined,
  allTime: SpotifyData['allTime'],
): SpotifyData {
  const nowPlaying = current?.item
    ? {
        ...mapTrack(current.item),
        isPlaying: current.is_playing,
        progressMs: current.progress_ms,
        durationMs: current.item.duration_ms ?? null,
      }
    : null;

  // Spotify occasionally returns a 200 with an empty item list for one time_range while the
  // others are fully populated (observed for long_term). Treat that as a missed update, not
  // a real "you have no history" state, so a single flaky response can't wipe out previously
  // good data — it'll self-heal on the next refresh.
  return {
    nowPlaying,
    recentlyPlayed: recent
      ? recent.items.map((entry) => ({ ...mapTrack(entry.track), playedAt: entry.played_at }))
      : previousSnapshot?.recentlyPlayed ?? [],
    topArtists: {
      shortTerm: pickTopList<SpotifyData['topArtists']['shortTerm'][number]>(topData?.artistsShort.map(mapArtist), previousSnapshot?.topArtists.shortTerm),
      mediumTerm: pickTopList<SpotifyData['topArtists']['mediumTerm'][number]>(topData?.artistsMedium.map(mapArtist), previousSnapshot?.topArtists.mediumTerm),
      longTerm: pickTopList<SpotifyData['topArtists']['longTerm'][number]>(topData?.artistsLong.map(mapArtist), previousSnapshot?.topArtists.longTerm),
    },
    topTracks: {
      shortTerm: pickTopList<SpotifyData['topTracks']['shortTerm'][number]>(topData?.tracksShort.map(mapTrack), previousSnapshot?.topTracks.shortTerm),
      mediumTerm: pickTopList<SpotifyData['topTracks']['mediumTerm'][number]>(topData?.tracksMedium.map(mapTrack), previousSnapshot?.topTracks.mediumTerm),
      longTerm: pickTopList<SpotifyData['topTracks']['longTerm'][number]>(topData?.tracksLong.map(mapTrack), previousSnapshot?.topTracks.longTerm),
    },
    allTime,
  };
}

export function createSpotifyProvider(
  oauth: { clientId: string; clientSecret: string } | undefined,
  snapshotStore: SpotifySnapshotStore,
  historyStore: SpotifyHistoryStore,
): Provider<SpotifyData> {
  let topData: TopData | undefined;
  let topDataFetchedAt = 0;
  let nextRecentReconciliationAt = 0;
  let nextAttemptNotBefore = 0;

  const nextRefreshMs = (data: SpotifyData | undefined): number => {
    const now = Date.now();
    if (nextAttemptNotBefore > now) return nextAttemptNotBefore - now;

    const untilRecentReconciliation = Math.max(0, nextRecentReconciliationAt - now);
    const nowPlaying = data?.nowPlaying;
    const untilPlaybackEnd =
      nowPlaying?.isPlaying && nowPlaying.progressMs != null && nowPlaying.durationMs != null
        ? Math.max(
            MIN_PLAYBACK_CHECK_MS,
            nowPlaying.durationMs - nowPlaying.progressMs + PLAYBACK_FINISH_GRACE_MS,
          )
        : IDLE_PLAYBACK_CHECK_MS;

    return Math.min(untilPlaybackEnd, untilRecentReconciliation);
  };

  // Recent history is reconciled independently every 15 minutes (see nextRecentReconciliationAt).
  const fetchRecentIfDue = async (get: SpotifyGet): Promise<RecentlyPlayed | null | undefined> => {
    if (Date.now() < nextRecentReconciliationAt) return undefined;
    const recent = await get<RecentlyPlayed>('/me/player/recently-played?limit=50');
    nextRecentReconciliationAt = Date.now() + RECENT_RECONCILIATION_MS;
    return recent;
  };

  const refreshTopDataIfDue = async (get: SpotifyGet): Promise<boolean> => {
    if (topDataFetchedAt === 0) topDataFetchedAt = await snapshotStore.getTopDataFetchedAt();
    if (topDataFetchedAt !== 0 && Date.now() - topDataFetchedAt < TOP_DATA_REFRESH_MS) return false;
    topData = await refreshTopData(get, historyStore);
    topDataFetchedAt = Date.now();
    return true;
  };

  // Playback state goes stale immediately: replaying an old track as "Now playing" is
  // misleading. The longer-lived listening data remains useful during the cooldown.
  // allTime is a pure local DB read with no Spotify API dependency, so recompute it fresh
  // even while rate-limited — no reason to keep serving a stale all-time leaderboard just
  // because live playback data can't be fetched right now.
  const handleFetchError = async (error: unknown): Promise<SpotifyData> => {
    const lastGoodSnapshot = await snapshotStore.getSnapshot();
    const rateLimitedUntil = await snapshotStore.getRateLimitedUntil();
    nextAttemptNotBefore = isRateLimitError(error)
      ? Math.max(rateLimitedUntil, Date.now() + MIN_PLAYBACK_CHECK_MS)
      : Date.now() + FAILURE_RETRY_MS;
    if (lastGoodSnapshot && isRateLimitError(error)) {
      return { ...lastGoodSnapshot, nowPlaying: null, allTime: await historyStore.getAllTime() };
    }
    throw error;
  };

  return {
    id: 'spotify',
    schema: spotifySchema,
    // The client still re-reads this cache every 30 seconds so a playback-aware server refresh
    // appears promptly in the UI. The server itself uses nextRefreshMs below.
    refreshMs: 60_000,
    timeoutMs: 20_000,
    isConfigured: () => oauth !== undefined && readSpotifyToken() !== undefined,
    loadCached: () => snapshotStore.getSnapshotWithFetchedAt(),
    nextRefreshMs,
    async fetch(signal) {
      if (!oauth) throw new Error('spotify is not configured');
      try {
        const bearer = await accessToken(oauth, signal);
        const previousSnapshot = await snapshotStore.getSnapshot();
        const get = createSpotifyGet(bearer, signal, snapshotStore, () => accessToken(oauth, signal, true));

        // Playback is checked at the expected track end (with a low-frequency idle guard).
        const current = await get<CurrentlyPlaying>('/me/player/currently-playing');
        const recent = await fetchRecentIfDue(get);
        const topDataRefreshed = await refreshTopDataIfDue(get);
        if (recent) await recordRecentPlays(recent, historyStore);

        const snapshot = buildSnapshot(current, recent, previousSnapshot, topData, await historyStore.getAllTime());
        // Best-effort: a dropped snapshot write must not discard the live data already in hand
        // (and must not be mistaken for a rate-limit failure by the catch block below).
        await snapshotStore.setSnapshot(snapshot, topDataRefreshed ? topDataFetchedAt : undefined).catch(() => undefined);
        nextAttemptNotBefore = 0;
        return snapshot;
      } catch (error) {
        return await handleFetchError(error);
      }
    },
  };
}
