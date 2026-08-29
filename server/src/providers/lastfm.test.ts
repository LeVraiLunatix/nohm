import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLastFmProvider } from './lastfm.js';

afterEach(() => vi.unstubAllGlobals());

describe('createLastFmProvider', () => {
  it('is disabled without a key and username', () => {
    expect(createLastFmProvider().isConfigured()).toBe(false);
  });

  it('normalizes recent listening, favorites and statistics without leaking the key', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL) => {
      const method = new URL(input).searchParams.get('method');
      const payloads: Record<string, unknown> = {
        'user.getRecentTracks': { recenttracks: { track: [{ name: 'Echo', artist: { '#text': 'Nohm' }, album: { '#text': 'Signal' }, '@attr': { nowplaying: 'true' }, url: 'https://last.fm/echo' }] } },
        'user.getTopArtists': { topartists: { artist: [{ name: 'Nohm', playcount: '42' }] } },
        'user.getTopTracks': { toptracks: { track: [{ name: 'Echo', artist: { name: 'Nohm' }, playcount: '12' }] } },
        'user.getTopAlbums': { topalbums: { album: [{ name: 'Signal', artist: { name: 'Nohm' }, playcount: '9' }] } },
        'user.getLovedTracks': { lovedtracks: { track: [{ name: 'Echo', artist: { name: 'Nohm' } }] } },
      };
      return Response.json(payloads[method ?? ''] ?? {});
    }));
    const data = await createLastFmProvider({ apiKey: 'secret', user: 'listener' }).fetch(new AbortController().signal, false);
    expect(data).toMatchObject({ playing: true, track: { title: 'Echo', artist: 'Nohm' }, favorites: [{ title: 'Echo' }] });
    expect(data.statistics?.topArtists[0]).toMatchObject({ label: 'Nohm', playCount: 42 });
    expect(JSON.stringify(data)).not.toContain('secret');
  });
});
