import { spotifySchema, type SpotifyData } from '@nohm/shared';
import type { Database } from './db/client.js';

/** Owner-only last-good Spotify data and rate-limit deadline, shared safely by all installations. */
export class SpotifySnapshotStore {
  constructor(private readonly database: Database) {}

  async getSnapshot(): Promise<SpotifyData | undefined> {
    const [row] = await this.database.client<{ snapshot: unknown }[]>`
      select snapshot from spotify_snapshot where id = 1
    `;
    return row?.snapshot ? spotifySchema.parse(row.snapshot) : undefined;
  }

  /** Same row as getSnapshot, plus when it was written — for the scheduler's cross-restart cache. */
  async getSnapshotWithFetchedAt(): Promise<{ data: SpotifyData; fetchedAt: Date } | undefined> {
    const [row] = await this.database.client<{ snapshot: unknown; updated_at: string }[]>`
      select snapshot, updated_at from spotify_snapshot where id = 1
    `;
    return row?.snapshot ? { data: spotifySchema.parse(row.snapshot), fetchedAt: new Date(row.updated_at) } : undefined;
  }

  async getRateLimitedUntil(): Promise<number> {
    const [row] = await this.database.client<{ rate_limited_until: number }[]>`
      select rate_limited_until from spotify_snapshot where id = 1
    `;
    return Number(row?.rate_limited_until ?? 0);
  }

  /** Kept separately from snapshot.updated_at because live playback updates do not refresh top lists. */
  async getTopDataFetchedAt(): Promise<number> {
    const [row] = await this.database.client<{ top_data_fetched_at: number }[]>`
      select top_data_fetched_at from spotify_snapshot where id = 1
    `;
    return Number(row?.top_data_fetched_at ?? 0);
  }

  async setRateLimitedUntil(until: number): Promise<void> {
    const sql = this.database.client;
    await sql`
      insert into spotify_snapshot (id, rate_limited_until) values (1, ${until})
      on conflict (id) do update set
        rate_limited_until = greatest(spotify_snapshot.rate_limited_until, excluded.rate_limited_until),
        updated_at = now()
    `;
  }

  async setSnapshot(snapshot: SpotifyData, topDataFetchedAt?: number): Promise<void> {
    const sql = this.database.client;
    await sql`
      insert into spotify_snapshot (id, snapshot, rate_limited_until, top_data_fetched_at)
      values (1, ${JSON.stringify(snapshot)}::text::jsonb, 0, ${topDataFetchedAt ?? 0})
      on conflict (id) do update set
        snapshot = excluded.snapshot,
        rate_limited_until = 0,
        top_data_fetched_at = case
          when excluded.top_data_fetched_at > 0 then excluded.top_data_fetched_at
          else spotify_snapshot.top_data_fetched_at
        end,
        updated_at = now()
    `;
  }
}
