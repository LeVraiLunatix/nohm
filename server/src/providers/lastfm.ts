import { MUSIC_CAPABILITIES, musicDataSchema, type MusicData, type MusicTrack } from '@nohm/shared';
import type { Provider } from '../scheduler.js';

export interface LastFmConfig {
  apiKey: string;
  user: string;
}

type LastFmImage = { '#text'?: string; size?: string };
type LastFmArtist = string | { '#text'?: string; name?: string };
type LastFmTrack = {
  mbid?: string;
  name?: string;
  artist?: LastFmArtist;
  album?: { '#text'?: string };
  image?: LastFmImage[];
  url?: string;
  date?: { uts?: string; '#text'?: string };
  '@attr'?: { nowplaying?: string };
  playcount?: string;
};
type LastFmAlbum = {
  name?: string;
  artist?: LastFmArtist;
  image?: LastFmImage[];
  url?: string;
  playcount?: string;
};

const capabilities = Object.fromEntries(
  MUSIC_CAPABILITIES.map((capability) => [capability, false]),
) as MusicData['capabilities'];
Object.assign(capabilities, {
  'now-playing': true,
  history: true,
  favorites: true,
  statistics: true,
});

function artistName(artist?: LastFmArtist): string {
  if (typeof artist === 'string') return artist;
  return artist?.['#text'] || artist?.name || 'Artiste inconnu';
}

function artwork(images?: LastFmImage[]): string | undefined {
  const value = [...(images ?? [])].reverse().find((image) => image['#text'])?.['#text'];
  return value || undefined;
}

function normalizeTrack(track?: LastFmTrack): MusicTrack | undefined {
  if (!track?.name) return undefined;
  return {
    id: track.mbid || undefined,
    title: track.name,
    artist: artistName(track.artist),
    album: track.album?.['#text'] || undefined,
    artworkUrl: artwork(track.image),
    url: track.url || undefined,
  };
}

function list<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function request(
  config: LastFmConfig,
  method: string,
  signal: AbortSignal,
  limit: number,
): Promise<Record<string, unknown>> {
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.search = new URLSearchParams({
    method,
    user: config.user,
    api_key: config.apiKey,
    format: 'json',
    limit: String(limit),
  }).toString();
  const response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`lastfm-${response.status}`);
  const payload = await response.json() as Record<string, unknown> & { error?: unknown };
  if (payload.error !== undefined) throw new Error('lastfm-api-error');
  return payload;
}

function statistic(item: LastFmTrack | LastFmAlbum, label: string) {
  return {
    label,
    playCount: Math.max(0, Number.parseInt(item.playcount || '0', 10) || 0),
    artworkUrl: artwork(item.image),
    url: item.url || undefined,
  };
}

export function createLastFmProvider(config?: LastFmConfig): Provider<MusicData> {
  return {
    id: 'music-lastfm',
    schema: musicDataSchema,
    refreshMs: 60_000,
    timeoutMs: 8_000,
    isConfigured: () => config !== undefined,
    async fetch(signal) {
      if (!config) throw new Error('lastfm-not-configured');
      const [recentPayload, artistsPayload, tracksPayload, albumsPayload, lovedPayload] = await Promise.all([
        request(config, 'user.getRecentTracks', signal, 20),
        request(config, 'user.getTopArtists', signal, 8),
        request(config, 'user.getTopTracks', signal, 8),
        request(config, 'user.getTopAlbums', signal, 8),
        request(config, 'user.getLovedTracks', signal, 12),
      ]);

      const recent = list(((recentPayload.recenttracks as { track?: LastFmTrack | LastFmTrack[] } | undefined)?.track));
      const now = recent.find((track) => track['@attr']?.nowplaying === 'true');
      const history = recent.flatMap((entry) => {
        const track = normalizeTrack(entry);
        if (!track) return [];
        const seconds = Number.parseInt(entry.date?.uts || '', 10);
        return [{
          track,
          playedAt: Number.isFinite(seconds) ? new Date(seconds * 1_000).toISOString() : undefined,
          nowPlaying: entry['@attr']?.nowplaying === 'true',
        }];
      });
      const topArtists = list(((artistsPayload.topartists as { artist?: LastFmAlbum | LastFmAlbum[] } | undefined)?.artist));
      const topTracks = list(((tracksPayload.toptracks as { track?: LastFmTrack | LastFmTrack[] } | undefined)?.track));
      const topAlbums = list(((albumsPayload.topalbums as { album?: LastFmAlbum | LastFmAlbum[] } | undefined)?.album));
      const loved = list(((lovedPayload.lovedtracks as { track?: LastFmTrack | LastFmTrack[] } | undefined)?.track));

      return {
        provider: 'lastfm',
        providerLabel: 'Last.fm',
        capabilities,
        playing: now !== undefined,
        track: normalizeTrack(now ?? recent[0]!),
        device: `@${config.user}`,
        queue: [],
        history,
        favorites: loved.flatMap((entry) => {
          const track = normalizeTrack(entry);
          return track ? [track] : [];
        }),
        statistics: {
          topArtists: topArtists.map((entry) => statistic(entry, entry.name || artistName(entry.artist))),
          topTracks: topTracks.map((entry) => statistic(entry, `${entry.name || '—'} · ${artistName(entry.artist)}`)),
          topAlbums: topAlbums.map((entry) => statistic(entry, `${entry.name || '—'} · ${artistName(entry.artist)}`)),
        },
      };
    },
  };
}
