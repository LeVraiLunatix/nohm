import { describe, expect, it, vi } from 'vitest';
import type { SpotifyData } from '@nohm/shared';
import { createSpotifyProvider, toPlayedTrackInput } from './spotify.js';

vi.mock('../spotifyToken.js', () => ({
  readSpotifyToken: () => ({
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    expires_at: Date.now() + 120_000,
  }),
  writeSpotifyToken: vi.fn(),
}));

const snapshot: SpotifyData = {
  nowPlaying: {
    track: 'Old Song',
    artist: 'Old Artist',
    isPlaying: true,
    progressMs: 42_000,
    durationMs: 180_000,
  },
  recentlyPlayed: [],
  topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
  topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
  allTime: { artists: [], tracks: [], albums: [] },
};

const rawTrack = {
  id: 'track-id',
  name: 'Current Song',
  duration_ms: 180_000,
  artists: [{ id: 'artist-id', name: 'Current Artist' }],
  album: { id: 'album-id', name: 'Current Album' },
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

describe('Spotify provider', () => {
  it('uses the album-level artist rather than a featured track artist', () => {
    const track = {
      ...rawTrack,
      artists: [
        { id: 'weeknd', name: 'The Weeknd' },
        { id: 'lana', name: 'Lana Del Rey' },
      ],
      album: {
        ...rawTrack.album,
        artists: [{ id: 'weeknd', name: 'The Weeknd' }],
      },
    };

    expect(toPlayedTrackInput(track)?.album.artist).toBe('The Weeknd');
  });

  it('hides stale now-playing data while preserving the cached snapshot after a rate limit', async () => {
    const snapshotStore = {
      getRateLimitedUntil: vi.fn().mockResolvedValue(0),
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
      setRateLimitedUntil: vi.fn().mockResolvedValue(undefined),
    };
    const historyStore = { getAllTime: vi.fn().mockResolvedValue(snapshot.allTime) };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
      status: 429,
      headers: { 'retry-after': '30' },
    }));

    try {
      const provider = createSpotifyProvider(
        { clientId: 'test-client-id', clientSecret: 'test-client-secret' },
        snapshotStore as never,
        historyStore as never,
      );

      await expect(provider.fetch(new AbortController().signal)).resolves.toEqual({
        ...snapshot,
        nowPlaying: null,
      });
      expect(snapshotStore.setRateLimitedUntil).toHaveBeenCalledOnce();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('refreshes an unexpectedly rejected access token and retries the request once', async () => {
    let stored = snapshot;
    const snapshotStore = {
      getRateLimitedUntil: vi.fn().mockResolvedValue(0),
      getSnapshot: vi.fn().mockImplementation(async () => stored),
      getTopDataFetchedAt: vi.fn().mockImplementation(async () => Date.now()),
      setSnapshot: vi.fn().mockImplementation(async (next: SpotifyData) => {
        stored = next;
      }),
    };
    const historyStore = {
      recordPlays: vi.fn().mockResolvedValue(undefined),
      getAllTime: vi.fn().mockResolvedValue(snapshot.allTime),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ access_token: 'refreshed-access-token', expires_in: 3600 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));

    try {
      const provider = createSpotifyProvider(
        { clientId: 'test-client-id', clientSecret: 'test-client-secret' },
        snapshotStore as never,
        historyStore as never,
      );

      await expect(provider.fetch(new AbortController().signal)).resolves.toMatchObject({ nowPlaying: null });
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
        expect.stringContaining('/me/player/currently-playing'),
        expect.stringContaining('accounts.spotify.com/api/token'),
        expect.stringContaining('/me/player/currently-playing'),
        expect.stringContaining('/me/player/recently-played?limit=50'),
      ]);
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('checks playback between 15-minute recent-history reconciliations', async () => {
    let stored = snapshot;
    const snapshotStore = {
      getRateLimitedUntil: vi.fn().mockResolvedValue(0),
      getSnapshot: vi.fn().mockImplementation(async () => stored),
      getTopDataFetchedAt: vi.fn().mockImplementation(async () => Date.now()),
      setSnapshot: vi.fn().mockImplementation(async (next: SpotifyData) => {
        stored = next;
      }),
    };
    const historyStore = {
      recordPlays: vi.fn().mockResolvedValue(undefined),
      getAllTime: vi.fn().mockResolvedValue(snapshot.allTime),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ is_playing: true, progress_ms: 60_000, item: rawTrack }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ track: rawTrack, played_at: '2026-07-15T12:00:00.000Z' }] }))
      .mockResolvedValueOnce(jsonResponse({ is_playing: true, progress_ms: 0, item: rawTrack }));

    try {
      const provider = createSpotifyProvider(
        { clientId: 'test-client-id', clientSecret: 'test-client-secret' },
        snapshotStore as never,
        historyStore as never,
      );

      await provider.fetch(new AbortController().signal);
      const second = await provider.fetch(new AbortController().signal);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
        expect.stringContaining('/me/player/currently-playing'),
        expect.stringContaining('/me/player/recently-played?limit=50'),
        expect.stringContaining('/me/player/currently-playing'),
      ]);
      expect(historyStore.recordPlays).toHaveBeenCalledTimes(1);
      expect(second.recentlyPlayed).toHaveLength(1);
      expect(provider.nextRefreshMs?.(second)).toBeGreaterThan(175_000);
    } finally {
      fetchMock.mockRestore();
    }
  });
});
