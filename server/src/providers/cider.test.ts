import { describe, expect, it, vi } from 'vitest';
import { createCiderProvider } from './cider.js';

describe('createCiderProvider', () => {
  it('stays disabled until local RPC access is explicitly configured', () => {
    expect(createCiderProvider().isConfigured()).toBe(false);
  });

  it('normalizes official Cider RPC payloads without exposing the app token', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/now-playing')) return new Response(JSON.stringify({ info: { name: 'Track', artistName: 'Artist', albumName: 'Album', durationInMillis: 120000, currentPlaybackTime: 4, playParams: { id: '1' }, repeatMode: 1, shuffleMode: 0 } }));
      if (url.endsWith('/is-playing')) return new Response(JSON.stringify({ is_playing: true }));
      if (url.endsWith('/volume')) return new Response(JSON.stringify({ volume: 0.5 }));
      return new Response(JSON.stringify([]));
    });
    vi.stubGlobal('fetch', fetchMock);
    const provider = createCiderProvider({ baseUrl: 'http://127.0.0.1:10767', token: 'secret' });
    const data = await provider.fetch(new AbortController().signal, false);
    expect(data).toMatchObject({ provider: 'cider', playing: true, volume: 0.5, positionMs: 4000, repeat: 'one', track: { title: 'Track', artist: 'Artist' } });
    expect(JSON.stringify(data)).not.toContain('secret');
    vi.unstubAllGlobals();
  });
});
