import { describe, expect, it } from 'vitest';
import type { SpotifyData } from '@nohm/shared';
import { spotifyCandidates } from './spotify.js';

describe('spotifyCandidates', () => {
  const RECENT_PLAYED_MAX_AGE_MS = 6 * 60 * 60_000;

  it('uses the primary artist for a newly surfaced album', () => {
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [],
      topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
      topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
      allTime: {
        artists: [],
        tracks: [],
        albums: [{
          id: 'album-id',
          name: 'Album Title',
          artist: 'Primary Artist, Featured Artist',
          playCount: 12,
          topTracks: [],
        }],
      },
    };

    const candidates = spotifyCandidates(data, {
      trackShort: false, trackMedium: false, trackLong: false,
      trackAllTime: false,
      artistShort: false, artistMedium: false, artistLong: false, artistAllTime: false,
      albumAllTime: true,
    }, RECENT_PLAYED_MAX_AGE_MS);

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-album:album-id')).toMatchObject({
      detail: 'Primary Artist',
      score: 90,
    });
  });

  it('labels a long-term top-track change as a past-year signal', () => {
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [],
      topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
      topTracks: {
        shortTerm: [],
        mediumTerm: [],
        longTerm: [{ track: 'Baptized In Fear', artist: 'The Weeknd' }],
      },
      allTime: { artists: [], tracks: [], albums: [] },
    };

    const candidates = spotifyCandidates(data, {
      trackShort: false, trackMedium: false, trackLong: true,
      trackAllTime: false,
      artistShort: false, artistMedium: false, artistLong: false, artistAllTime: false,
      albumAllTime: false,
    }, RECENT_PLAYED_MAX_AGE_MS);

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-track:long:Baptized In Fear')?.kicker)
      .toBe('New top track this past year');
  });

  it('allows a genuinely new monthly top artist to use secondary', () => {
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [],
      topArtists: { shortTerm: [{ id: 'artist-id', name: 'Monthly Artist', genres: [] }], mediumTerm: [], longTerm: [] },
      topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
      allTime: { artists: [], tracks: [], albums: [] },
    };

    const candidates = spotifyCandidates(data, {
      trackShort: false, trackMedium: false, trackLong: false, trackAllTime: false,
      artistShort: true, artistMedium: false, artistLong: false, artistAllTime: false,
      albumAllTime: false,
    }, RECENT_PLAYED_MAX_AGE_MS);

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-artist:short:artist-id')).toMatchObject({
      kicker: 'New #1 artist · this month',
      detail: '',
      render: { type: 'spotify-artist', artistId: 'artist-id', timeframe: 'short' },
      shapes: ['secondary', 'tile'],
    });
  });

  it('gives true all-time track and artist changes a higher priority than annual changes', () => {
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [],
      topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
      topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
      allTime: {
        artists: [{ id: 'artist-id', name: 'All Time Artist', genres: [], playCount: 20 }],
        tracks: [{ id: 'track-id', track: 'All Time Track', artist: 'All Time Artist', playCount: 20 }],
        albums: [],
      },
    };

    const candidates = spotifyCandidates(data, {
      trackShort: false, trackMedium: false, trackLong: false, trackAllTime: true,
      artistShort: false, artistMedium: false, artistLong: false, artistAllTime: true,
      albumAllTime: false,
    }, RECENT_PLAYED_MAX_AGE_MS);

    expect(candidates.find((candidate) => candidate.id === 'spotify:new-track:allTime:track-id')).toMatchObject({
      kicker: 'New top track of all time',
      score: 90,
    });
    expect(candidates.find((candidate) => candidate.id === 'spotify:new-artist:allTime:artist-id')).toMatchObject({
      kicker: 'New #1 artist · of all time',
      score: 90,
    });
  });

  const NO_FRESH_CHANGES = {
    trackShort: false, trackMedium: false, trackLong: false, trackAllTime: false,
    artistShort: false, artistMedium: false, artistLong: false, artistAllTime: false,
    albumAllTime: false,
  };

  it('surfaces "Last played" for a track that played within the max age', () => {
    const recentDate = new Date(Date.now() - RECENT_PLAYED_MAX_AGE_MS + 60_000).toISOString();
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [{ id: 'track-id', track: 'Recent Track', artist: 'Recent Artist', playedAt: recentDate }],
      topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
      topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
      allTime: { artists: [], tracks: [], albums: [] },
    };

    const candidates = spotifyCandidates(data, NO_FRESH_CHANGES, RECENT_PLAYED_MAX_AGE_MS);

    expect(candidates.find((candidate) => candidate.id === 'spotify:recent:track-id')).toMatchObject({
      kicker: 'Last played',
      title: 'Recent Track',
    });
  });

  it('drops "Last played" once the track is older than the max age, instead of lingering forever', () => {
    const staleDate = new Date(Date.now() - RECENT_PLAYED_MAX_AGE_MS - 60_000).toISOString();
    const data: SpotifyData = {
      nowPlaying: null,
      recentlyPlayed: [{ id: 'track-id', track: 'Stale Track', artist: 'Stale Artist', playedAt: staleDate }],
      topArtists: { shortTerm: [], mediumTerm: [], longTerm: [] },
      topTracks: { shortTerm: [], mediumTerm: [], longTerm: [] },
      allTime: { artists: [], tracks: [], albums: [] },
    };

    const candidates = spotifyCandidates(data, NO_FRESH_CHANGES, RECENT_PLAYED_MAX_AGE_MS);

    expect(candidates).toHaveLength(0);
  });
});
