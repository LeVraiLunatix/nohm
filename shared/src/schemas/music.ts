import { z } from 'zod';

export const MUSIC_CAPABILITIES = [
  'now-playing', 'play', 'pause', 'previous', 'next', 'seek', 'volume',
  'shuffle', 'repeat', 'device', 'queue', 'history', 'favorites', 'statistics',
] as const;

export const musicCapabilitiesSchema = z.record(z.enum(MUSIC_CAPABILITIES), z.boolean());

export const musicTrackSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  artist: z.string(),
  album: z.string().optional(),
  artworkUrl: z.string().url().optional(),
  durationMs: z.number().nonnegative().optional(),
  url: z.string().url().optional(),
});

export const musicQueueItemSchema = z.object({
  index: z.number().int().nonnegative(),
  track: musicTrackSchema,
  current: z.boolean().default(false),
});

export const musicHistoryItemSchema = z.object({
  track: musicTrackSchema,
  playedAt: z.string().datetime().optional(),
  nowPlaying: z.boolean().default(false),
});

export const musicStatisticSchema = z.object({
  label: z.string(),
  playCount: z.number().int().nonnegative(),
  artworkUrl: z.string().url().optional(),
  url: z.string().url().optional(),
});

export const musicDataSchema = z.object({
  provider: z.enum(['cider', 'spotify', 'lastfm', 'apple-music']),
  providerLabel: z.string(),
  capabilities: musicCapabilitiesSchema,
  playing: z.boolean(),
  track: musicTrackSchema.optional(),
  positionMs: z.number().nonnegative().optional(),
  volume: z.number().min(0).max(1).optional(),
  shuffle: z.boolean().optional(),
  repeat: z.enum(['off', 'one', 'all']).optional(),
  device: z.string().optional(),
  queue: z.array(musicQueueItemSchema).default([]),
  history: z.array(musicHistoryItemSchema).default([]),
  favorites: z.array(musicTrackSchema).default([]),
  statistics: z.object({
    topArtists: z.array(musicStatisticSchema).default([]),
    topTracks: z.array(musicStatisticSchema).default([]),
    topAlbums: z.array(musicStatisticSchema).default([]),
  }).optional(),
});

export type MusicCapability = (typeof MUSIC_CAPABILITIES)[number];
export type MusicData = z.infer<typeof musicDataSchema>;
export type MusicTrack = z.infer<typeof musicTrackSchema>;
