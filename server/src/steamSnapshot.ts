import { z } from 'zod';
import { steamGameSchema, steamLeaderboardEntrySchema, steamSchema, type SteamData, type SteamLeaderboardEntry } from '@nohm/shared';
import type { Database } from './db/client.js';

const steamLibrarySnapshotSchema = z.object({
  totalGames: z.number(),
  totalPlaytimeMinutes: z.number(),
  recentPlaytimeMinutes: z.number(),
  mostPlayed: z.array(steamGameSchema),
  allGames: z.array(steamGameSchema),
});

export type SteamLibrarySnapshot = z.infer<typeof steamLibrarySnapshotSchema>;

const steamAchievementSchemaEntrySchema = z.object({
  apiName: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
});

export type SteamAchievementSchemaEntry = z.infer<typeof steamAchievementSchemaEntrySchema>;

const steamAchievementPercentageEntrySchema = z.object({
  apiName: z.string(),
  percent: z.number(),
});

export type SteamAchievementPercentageEntry = z.infer<typeof steamAchievementPercentageEntrySchema>;

async function getCached<T>(
  database: Database,
  metric: string,
  schema: z.ZodType<T>,
): Promise<{ data: T; fetchedAt: Date } | undefined> {
  const [row] = await database.client<{ value: unknown; changed_at: string }[]>`
    select value, changed_at from signal_current where source = 'steam' and metric = ${metric}
  `;
  if (!row) return undefined;
  // A row written under an older schema version (e.g. before a field was added) shouldn't crash
  // the whole provider — treat it the same as a cache miss and let the caller re-fetch fresh data.
  const parsed = schema.safeParse(row.value);
  if (!parsed.success) {
    console.warn(`[steam] cached ${metric} no longer matches the schema, ignoring:`, parsed.error.message);
    return undefined;
  }
  return { data: parsed.data, fetchedAt: new Date(row.changed_at) };
}

async function setCached(database: Database, metric: string, value: unknown): Promise<void> {
  await database.client`
    insert into signal_current (source, metric, value, changed_at)
    values ('steam', ${metric}, ${JSON.stringify(value)}::text::jsonb, now())
    on conflict (source, metric) do update set value = excluded.value, changed_at = now()
  `;
}

/** Cross-server last-good Steam data plus the slower-moving caches (library, achievement schema/rarity)
 * that would otherwise mean re-downloading a whole library or global rarity data on every 5-minute refresh. */
export class SteamSnapshotStore {
  constructor(private readonly database: Database) {}

  getSnapshot(): Promise<{ data: SteamData; fetchedAt: Date } | undefined> {
    return getCached(this.database, 'snapshot', steamSchema);
  }

  setSnapshot(data: SteamData): Promise<void> {
    return setCached(this.database, 'snapshot', data);
  }

  getLibraryCache(): Promise<{ data: SteamLibrarySnapshot; fetchedAt: Date } | undefined> {
    return getCached(this.database, 'library', steamLibrarySnapshotSchema);
  }

  setLibraryCache(data: SteamLibrarySnapshot): Promise<void> {
    return setCached(this.database, 'library', data);
  }

  getAchievementSchema(appId: number): Promise<{ data: SteamAchievementSchemaEntry[]; fetchedAt: Date } | undefined> {
    return getCached(this.database, `achievement-schema:${appId}`, z.array(steamAchievementSchemaEntrySchema));
  }

  setAchievementSchema(appId: number, data: SteamAchievementSchemaEntry[]): Promise<void> {
    return setCached(this.database, `achievement-schema:${appId}`, data);
  }

  getAchievementPercentages(
    appId: number,
  ): Promise<{ data: SteamAchievementPercentageEntry[]; fetchedAt: Date } | undefined> {
    return getCached(this.database, `achievement-percentages:${appId}`, z.array(steamAchievementPercentageEntrySchema));
  }

  setAchievementPercentages(appId: number, data: SteamAchievementPercentageEntry[]): Promise<void> {
    return setCached(this.database, `achievement-percentages:${appId}`, data);
  }

  getFriendsLeaderboard(): Promise<{ data: SteamLeaderboardEntry[]; fetchedAt: Date } | undefined> {
    return getCached(this.database, 'friends-leaderboard', z.array(steamLeaderboardEntrySchema));
  }

  setFriendsLeaderboard(data: SteamLeaderboardEntry[]): Promise<void> {
    return setCached(this.database, 'friends-leaderboard', data);
  }
}
