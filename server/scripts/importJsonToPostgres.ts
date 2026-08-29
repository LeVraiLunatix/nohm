/**
 * Deliberate one-off cutover tool. Stop all dashboard servers first, snapshot every machine's
 * server/.data directory, then run this once per chosen source directory. It is idempotent:
 * rerunning the same export restores the same rows without adding duplicate usage points.
 */
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { JSONValue, TransactionSql } from 'postgres';
import { healthDaySchema, spotifySchema, usageHistoryPointSchema } from '@nohm/shared';
import { createDatabase } from '../src/db/client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');
const dataDir = path.resolve(process.argv[2] ?? 'server/.data');

function readJson(name: string): unknown {
  const file = path.join(dataDir, name);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8'));
}

const healthFileSchema = z.object({ days: z.array(healthDaySchema).default([]) });
const usageFileSchema = z.object({
  tools: z.record(z.string(), z.array(usageHistoryPointSchema)).default({}),
  snapshots: z.record(z.string(), z.unknown()).default({}),
});
const spotifyCacheFileSchema = z.object({ snapshot: spotifySchema.optional(), rateLimitedUntil: z.number().default(0) });
const spotifyHistoryFileSchema = z.object({
  seededAt: z.string().optional(), lastPlayedAt: z.string().optional(),
  tracks: z.record(z.string(), z.object({
    id: z.string(), track: z.string(), artist: z.string(), artistIds: z.array(z.string()).default([]), album: z.string().optional(), albumId: z.string().optional(), releaseDate: z.string().optional(), durationMs: z.number().optional(), imageUrl: z.string().optional(), url: z.string().optional(), playCount: z.number(), verified: z.boolean().optional(),
  })).default({}),
  artists: z.record(z.string(), z.object({ id: z.string(), name: z.string(), imageUrl: z.string().optional(), url: z.string().optional(), genres: z.array(z.string()).default([]) })).default({}),
  albums: z.record(z.string(), z.object({ id: z.string(), name: z.string(), artist: z.string(), imageUrl: z.string().optional(), url: z.string().optional(), releaseDate: z.string().optional(), releaseDatePrecision: z.enum(['year', 'month', 'day']).optional(), totalTracks: z.number().optional(), totalDurationMs: z.number().optional(), albumType: z.enum(['album', 'single', 'compilation']).optional() })).default({}),
});

async function importHealthDays(sql: TransactionSql, days: z.infer<typeof healthFileSchema>['days']): Promise<number> {
  for (const day of days) {
    await sql`
      insert into health_days (date, steps, watch_steps, phone_steps, active_energy_kcal, exercise_minutes, stand_hours, heart_rate, resting_heart_rate, walking_heart_rate, blood_oxygen_percent)
      values (${day.date}, ${day.steps ?? null}, ${day.watchSteps ?? null}, ${day.phoneSteps ?? null}, ${day.activeEnergyKcal ?? null}, ${day.exerciseMinutes ?? null}, ${day.standHours ?? null}, ${day.heartRate ?? null}, ${day.restingHeartRate ?? null}, ${day.walkingHeartRate ?? null}, ${day.bloodOxygenPercent ?? null})
      on conflict (date) do update set steps = excluded.steps, watch_steps = excluded.watch_steps, phone_steps = excluded.phone_steps, active_energy_kcal = excluded.active_energy_kcal, exercise_minutes = excluded.exercise_minutes, stand_hours = excluded.stand_hours, heart_rate = excluded.heart_rate, resting_heart_rate = excluded.resting_heart_rate, walking_heart_rate = excluded.walking_heart_rate, blood_oxygen_percent = excluded.blood_oxygen_percent, updated_at = now()
    `;
  }
  return days.length;
}

async function importUsageHistory(sql: TransactionSql, usage: z.infer<typeof usageFileSchema>): Promise<number> {
  let count = 0;
  for (const [toolId, points] of Object.entries(usage.tools)) {
    for (const point of points) {
      await sql`
        insert into ai_usage_history_points (tool_id, at, five_hour_used_percent, five_hour_resets_at, weekly_used_percent, weekly_resets_at, model_weekly_used_percent)
        values (${toolId}, ${point.at}, ${point.fiveHourUsedPercent ?? null}, ${point.fiveHourResetsAt ?? null}, ${point.weeklyUsedPercent ?? null}, ${point.weeklyResetsAt ?? null}, ${point.modelWeeklyUsedPercent ?? null})
        on conflict (tool_id, at) do nothing
      `;
      count += 1;
    }
    const snapshot = usage.snapshots[toolId];
    if (snapshot !== undefined) await sql`
      insert into ai_usage_snapshots (tool_id, snapshot) values (${toolId}, ${JSON.stringify(snapshot as JSONValue)}::jsonb)
      on conflict (tool_id) do update set snapshot = excluded.snapshot, updated_at = now()
    `;
  }
  return count;
}

async function importSpotifyCache(sql: TransactionSql, cache: z.infer<typeof spotifyCacheFileSchema>): Promise<void> {
  await sql`
    insert into spotify_snapshot (id, snapshot, rate_limited_until) values (1, ${cache.snapshot ? JSON.stringify(cache.snapshot) : null}::jsonb, ${cache.rateLimitedUntil})
    on conflict (id) do update set snapshot = excluded.snapshot, rate_limited_until = excluded.rate_limited_until, updated_at = now()
  `;
}

async function importSpotifyHistory(sql: TransactionSql, history: z.infer<typeof spotifyHistoryFileSchema>): Promise<void> {
  for (const track of Object.values(history.tracks)) await sql`
    insert into spotify_tracks (id, track, artist, artist_ids, album, album_id, release_date, duration_ms, image_url, url, play_count, verified)
    values (${track.id}, ${track.track}, ${track.artist}, ${track.artistIds}, ${track.album ?? null}, ${track.albumId ?? null}, ${track.releaseDate ?? null}, ${track.durationMs ?? null}, ${track.imageUrl ?? null}, ${track.url ?? null}, ${track.playCount}, ${track.verified ?? null})
    on conflict (id) do update set track = excluded.track, artist = excluded.artist, artist_ids = excluded.artist_ids, album = excluded.album, album_id = excluded.album_id, release_date = excluded.release_date, duration_ms = excluded.duration_ms, image_url = excluded.image_url, url = excluded.url, play_count = excluded.play_count, verified = excluded.verified
  `;
  for (const artist of Object.values(history.artists)) await sql`
    insert into spotify_artists (id, name, image_url, url, genres) values (${artist.id}, ${artist.name}, ${artist.imageUrl ?? null}, ${artist.url ?? null}, ${artist.genres})
    on conflict (id) do update set name = excluded.name, image_url = excluded.image_url, url = excluded.url, genres = excluded.genres
  `;
  for (const album of Object.values(history.albums)) await sql`
    insert into spotify_albums (id, name, artist, image_url, url, release_date, release_date_precision, total_tracks, total_duration_ms, album_type)
    values (${album.id}, ${album.name}, ${album.artist}, ${album.imageUrl ?? null}, ${album.url ?? null}, ${album.releaseDate ?? null}, ${album.releaseDatePrecision ?? null}, ${album.totalTracks ?? null}, ${album.totalDurationMs ?? null}, ${album.albumType ?? null})
    on conflict (id) do update set name = excluded.name, artist = excluded.artist, image_url = excluded.image_url, url = excluded.url, release_date = excluded.release_date, release_date_precision = excluded.release_date_precision, total_tracks = excluded.total_tracks, total_duration_ms = excluded.total_duration_ms, album_type = excluded.album_type
  `;
  await sql`
    insert into spotify_history_meta (id, seeded_at, last_played_at) values (1, ${history.seededAt ?? null}, ${history.lastPlayedAt ?? null})
    on conflict (id) do update set seeded_at = excluded.seeded_at, last_played_at = excluded.last_played_at
  `;
}

const database = createDatabase(databaseUrl);
try {
  const health = healthFileSchema.safeParse(readJson('health.json'));
  const usage = usageFileSchema.safeParse(readJson('ai-usage-history.json'));
  const cache = spotifyCacheFileSchema.safeParse(readJson('spotify-cache.json'));
  const history = spotifyHistoryFileSchema.safeParse(readJson('spotify-history.json'));
  let healthCount = 0;
  let usageCount = 0;

  await database.client.begin(async (sql) => {
    if (health.success) healthCount = await importHealthDays(sql, health.data.days);
    if (usage.success) usageCount = await importUsageHistory(sql, usage.data);
    if (cache.success) await importSpotifyCache(sql, cache.data);
    if (history.success) await importSpotifyHistory(sql, history.data);
  });
  console.log(`Imported ${healthCount} health days and ${usageCount} AI usage points from ${dataDir}.`);
} finally {
  await database.client.end({ timeout: 5 });
}
