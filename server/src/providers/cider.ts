import { MUSIC_CAPABILITIES, musicDataSchema, type MusicData, type MusicTrack } from '@nohm/shared';
import type { Provider } from '../scheduler.js';

export interface CiderConfig {
  baseUrl: string;
  token?: string;
}

type CiderInfo = {
  playParams?: { id?: string };
  name?: string;
  artistName?: string;
  albumName?: string;
  durationInMillis?: number;
  currentPlaybackTime?: number;
  artwork?: { url?: string };
  url?: string;
  shuffleMode?: number;
  repeatMode?: number;
};

type QueueEntry = { index?: number; id?: string; attributes?: CiderInfo };

const capabilities = Object.fromEntries(MUSIC_CAPABILITIES.map((capability) => [capability, false])) as MusicData['capabilities'];
Object.assign(capabilities, {
  'now-playing': true,
  play: true,
  pause: true,
  previous: true,
  next: true,
  seek: true,
  volume: true,
  shuffle: true,
  repeat: true,
  queue: true,
});

function headers(config: CiderConfig): HeadersInit {
  return config.token ? { apptoken: config.token } : {};
}

async function requestJson(config: CiderConfig, path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(`${config.baseUrl}/api/v1/playback${path}`, { headers: headers(config), signal });
  if (!response.ok) throw new Error(`cider-rpc-${response.status}`);
  if (response.status === 204) return undefined;
  return response.json();
}

function artworkUrl(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace('{w}', '640').replace('{h}', '640');
}

function normalizeTrack(info: CiderInfo): MusicTrack | undefined {
  if (!info.name || !info.artistName) return undefined;
  return {
    id: info.playParams?.id,
    title: info.name,
    artist: info.artistName,
    album: info.albumName || undefined,
    artworkUrl: artworkUrl(info.artwork?.url),
    durationMs: typeof info.durationInMillis === 'number' ? info.durationInMillis : undefined,
    url: info.url,
  };
}

export function createCiderProvider(config?: CiderConfig): Provider<MusicData> {
  return {
    id: 'music-cider',
    schema: musicDataSchema,
    refreshMs: 5_000,
    timeoutMs: 2_500,
    isConfigured: () => config !== undefined,
    async fetch(signal) {
      if (!config) throw new Error('cider-not-configured');
      const [nowPayload, playingPayload, volumePayload, queuePayload] = await Promise.all([
        requestJson(config, '/now-playing', signal),
        requestJson(config, '/is-playing', signal),
        requestJson(config, '/volume', signal),
        requestJson(config, '/queue', signal),
      ]);
      const info = (nowPayload as { info?: CiderInfo } | undefined)?.info ?? {};
      const queue = Array.isArray(queuePayload) ? (queuePayload as QueueEntry[]) : [];
      return {
        provider: 'cider',
        providerLabel: 'Cider · Apple Music',
        capabilities,
        playing: Boolean((playingPayload as { is_playing?: boolean } | undefined)?.is_playing),
        track: normalizeTrack(info),
        positionMs: typeof info.currentPlaybackTime === 'number' ? info.currentPlaybackTime * 1_000 : undefined,
        volume: typeof (volumePayload as { volume?: unknown } | undefined)?.volume === 'number' ? (volumePayload as { volume: number }).volume : undefined,
        shuffle: typeof info.shuffleMode === 'number' ? info.shuffleMode !== 0 : undefined,
        repeat: info.repeatMode === 1 ? 'one' : info.repeatMode === 2 ? 'all' : 'off',
        device: 'Cider local',
        queue: queue.flatMap((entry, index) => {
          const track = normalizeTrack(entry.attributes ?? {});
          return track ? [{ index: entry.index ?? index, track, current: track.id === info.playParams?.id }] : [];
        }),
        history: [],
        favorites: [],
      };
    },
  };
}

const commandPaths = {
  play: '/play', pause: '/pause', previous: '/previous', next: '/next',
  'toggle-shuffle': '/toggle-shuffle', 'toggle-repeat': '/toggle-repeat',
} as const;

export type CiderCommand = keyof typeof commandPaths | 'seek' | 'volume';

export async function sendCiderCommand(config: CiderConfig, command: CiderCommand, value?: number): Promise<void> {
  const body = command === 'seek' ? { position: value } : command === 'volume' ? { volume: value } : undefined;
  const path = command === 'seek' ? '/seek' : command === 'volume' ? '/volume' : commandPaths[command];
  const response = await fetch(`${config.baseUrl}/api/v1/playback${path}`, {
    method: 'POST',
    headers: { ...headers(config), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(2_500),
  });
  if (!response.ok) throw new Error(`cider-rpc-${response.status}`);
}
