import type { SpotifyData } from '@nohm/shared';
import {
  buildSpotifyRotation,
  ARTIST_NAMES,
  MANUAL_ALBUM_IMAGES,
  MANUAL_ARTIST_IMAGES,
  ONE_OFFS,
  TRACKS,
} from '@nohm/shared';
import { fallbackArt } from './shared';

// ── Spotify — broadly-recognizable artists/tracks, real cover-art/photo CDN links where known ─

export function spotify(now: Date): SpotifyData {
  const artistImages = Object.fromEntries(ARTIST_NAMES.map((name) => [name, MANUAL_ARTIST_IMAGES[name]]));
  const albumImages = new Map<string, string>();
  for (const t of [...TRACKS, ...ONE_OFFS]) {
    if (!albumImages.has(t.album)) albumImages.set(t.album, MANUAL_ALBUM_IMAGES[t.album] ?? fallbackArt(t.album));
  }
  return buildSpotifyRotation(now, artistImages, albumImages);
}

/** The three tracks the command-center "now playing" secondary cycles through, with real track
 * lengths so the rotation timing looks plausible. Kept small and separate from the full
 * TRACKS/ONE_OFFS rotation above — this only needs to answer "what's playing right now", computed
 * fresh on every poll from the real clock (see api.ts), not baked into the fixture snapshot once
 * at page load, which is what let the old static nowPlaying freeze at 100% once the track "ended"
 * and never advance. */
const NOW_PLAYING_ROTATION = [
  { track: 'Blinding Lights', artist: 'The Weeknd', album: 'After Hours', durationMs: 200_040 },
  { track: 'Levitating', artist: 'Dua Lipa', album: 'Future Nostalgia', durationMs: 203_064 },
  { track: 'HUMBLE.', artist: 'Kendrick Lamar', album: 'DAMN.', durationMs: 177_000 },
];

export function spotifyNowPlayingAt(now: Date): SpotifyData['nowPlaying'] {
  const totalMs = NOW_PLAYING_ROTATION.reduce((sum, track) => sum + track.durationMs, 0);
  let elapsed = now.getTime() % totalMs;
  for (const track of NOW_PLAYING_ROTATION) {
    if (elapsed < track.durationMs) {
      return {
        track: track.track, artist: track.artist, album: track.album,
        imageUrl: MANUAL_ALBUM_IMAGES[track.album] ?? fallbackArt(track.album),
        isPlaying: true, progressMs: Math.round(elapsed), durationMs: track.durationMs,
      };
    }
    elapsed -= track.durationMs;
  }
  const [first] = NOW_PLAYING_ROTATION;
  return {
    track: first.track, artist: first.artist, album: first.album,
    imageUrl: MANUAL_ALBUM_IMAGES[first.album] ?? fallbackArt(first.album),
    isPlaying: true, progressMs: 0, durationMs: first.durationMs,
  };
}

