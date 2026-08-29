import type { SpotifyData } from '@nohm/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

/** Which top-N timeframe changed #1 recently — a personal dashboard cares whenever your music
 * taste shifts, not only on days GitHub is quiet. */
export interface SpotifyFreshness {
  trackShort: boolean;
  trackMedium: boolean;
  trackLong: boolean;
  trackAllTime: boolean;
  artistShort: boolean;
  artistMedium: boolean;
  artistLong: boolean;
  artistAllTime: boolean;
  albumAllTime: boolean;
}

type Timeframe = 'short' | 'medium' | 'long' | 'allTime';

/** Spotify's long_term window is approximately one year; short_term churns naturally and
 * shouldn't compete for hero with a meaningful annual shift. */
const TIMEFRAME_SCORE: Record<Timeframe, number> = { allTime: 90, long: 75, medium: 65, short: 60 };
const TIMEFRAME_SHAPES: Record<Timeframe, Candidate['shapes']> = {
  allTime: [...allShapes],
  long: [...allShapes],
  medium: ['secondary', 'tile'],
  short: ['secondary', 'tile'],
};
const TIMEFRAME_PERIOD: Record<Timeframe, string> = {
  allTime: 'of all time', long: 'this past year', medium: 'these last few months', short: 'this month',
};

export function spotifyCandidates(
  data: SpotifyData | undefined,
  fresh: SpotifyFreshness,
  recentPlayedMaxAgeMs: number,
): Candidate[] {
  if (!data) return [];
  const candidates: Candidate[] = [];

  const trackTiers: { key: Timeframe; track: SpotifyData['topTracks']['shortTerm'][number] | undefined; isFresh: boolean }[] = [
    { key: 'allTime', track: data.allTime.tracks[0], isFresh: fresh.trackAllTime },
    { key: 'long', track: data.topTracks.longTerm[0], isFresh: fresh.trackLong },
    { key: 'medium', track: data.topTracks.mediumTerm[0], isFresh: fresh.trackMedium },
    { key: 'short', track: data.topTracks.shortTerm[0], isFresh: fresh.trackShort },
  ];
  for (const tier of trackTiers) {
    if (!tier.track || !tier.isFresh) continue;
    candidates.push({
      id: `spotify:new-track:${tier.key}:${tier.track.id ?? tier.track.track}`, source: 'spotify', kind: 'spotify',
      score: TIMEFRAME_SCORE[tier.key], shapes: TIMEFRAME_SHAPES[tier.key],
      kicker: `New top track ${TIMEFRAME_PERIOD[tier.key]}`, title: tier.track.track, detail: tier.track.artist,
      href: '#/spotify', render: { type: 'spotify-track', trackId: tier.track.id ?? tier.track.track },
    });
  }

  const artistTiers: { key: Timeframe; artist: SpotifyData['topArtists']['shortTerm'][number] | undefined; isFresh: boolean }[] = [
    { key: 'allTime', artist: data.allTime.artists[0], isFresh: fresh.artistAllTime },
    { key: 'long', artist: data.topArtists.longTerm[0], isFresh: fresh.artistLong },
    { key: 'medium', artist: data.topArtists.mediumTerm[0], isFresh: fresh.artistMedium },
    { key: 'short', artist: data.topArtists.shortTerm[0], isFresh: fresh.artistShort },
  ];
  for (const tier of artistTiers) {
    if (!tier.artist || !tier.isFresh) continue;
    candidates.push({
      id: `spotify:new-artist:${tier.key}:${tier.artist.id ?? tier.artist.name}`, source: 'spotify', kind: 'spotify',
      score: TIMEFRAME_SCORE[tier.key], shapes: TIMEFRAME_SHAPES[tier.key],
      kicker: `New #1 artist · ${TIMEFRAME_PERIOD[tier.key]}`, title: tier.artist.name,
      detail: '',
      href: '#/spotify', render: { type: 'spotify-artist', artistId: tier.artist.id ?? tier.artist.name, timeframe: tier.key },
    });
  }

  const topAlbum = data.allTime.albums[0];
  if (topAlbum && fresh.albumAllTime) {
    candidates.push({
      id: `spotify:new-album:${topAlbum.id ?? topAlbum.name}`, source: 'spotify', kind: 'spotify',
      score: TIMEFRAME_SCORE.allTime, shapes: TIMEFRAME_SHAPES.allTime,
      kicker: 'New favorite album', title: topAlbum.name, detail: topAlbum.artist.split(',')[0]!.trim(),
      href: '#/spotify', render: { type: 'spotify-album', albumId: topAlbum.id ?? topAlbum.name },
    });
  }

  // No fresh change to headline — still worth a quiet tile naming your current favorite, but
  // only while the play itself is recent enough to still be "last played" and not a fixture.
  const recent = data.recentlyPlayed[0];
  const recentIsFresh = recent !== undefined && Date.now() - new Date(recent.playedAt).getTime() < recentPlayedMaxAgeMs;
  if (recent && recentIsFresh && !candidates.length) {
    candidates.push({
      id: `spotify:recent:${recent.id ?? recent.track}`, source: 'spotify', kind: 'spotify', score: 28, shapes: ['tile'],
      kicker: 'Last played', title: recent.track, detail: recent.artist,
      href: '#/spotify', render: { type: 'spotify-track', trackId: recent.id ?? recent.track },
    });
  }

  if (data.nowPlaying?.isPlaying) {
    candidates.push({
      id: 'spotify:now-playing', source: 'spotify', kind: 'spotify', score: 58, shapes: ['secondary', 'tile'],
      kicker: 'Now playing', title: data.nowPlaying.track, detail: data.nowPlaying.artist,
      href: '#/spotify', render: { type: 'spotify-now-playing' },
    });
  }
  return candidates;
}
