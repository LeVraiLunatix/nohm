import { valorantMatchSchema, valorantSchema, type ValorantData } from '@nohm/shared';
import { z } from 'zod';
import type { Database } from './db/client.js';

const cacheSchema = z.object({
  matches: z.array(valorantMatchSchema),
  totalMatchesAvailable: z.number().int().nonnegative(),
  fetchedAt: z.string(),
  /** Next shared stored-match/MMR page to ingest; reset to page one after a full pass. */
  nextPage: z.number().int().positive().default(1),
  sourceVersion: z.number().int().positive().default(1),
});

export type ValorantHistoryCache = z.infer<typeof cacheSchema>;

/**
 * A compact JSONB cache is a better fit than a row per match here: this is one private account,
 * the provider already returns a normalized, bounded history, and schema migrations should not
 * be required just to refresh the API's own archive.
 */
export class ValorantHistoryStore {
  constructor(private readonly database: Database) {}

  async get(): Promise<ValorantHistoryCache | undefined> {
    const [row] = await this.database.client<{ value: unknown }[]>`
      select value from signal_current where source = 'valorant' and metric = 'stored-match-history'
    `;
    const parsed = cacheSchema.safeParse(row?.value);
    return parsed.success ? parsed.data : undefined;
  }

  async set(cache: Omit<ValorantHistoryCache, 'fetchedAt'> & { fetchedAt?: string }): Promise<ValorantHistoryCache> {
    const value: ValorantHistoryCache = {
      ...cache,
      fetchedAt: cache.fetchedAt ?? new Date().toISOString(),
    };
    await this.database.client`
      insert into signal_current (source, metric, value, changed_at)
      values ('valorant', 'stored-match-history', ${JSON.stringify(value)}::text::jsonb, now())
      on conflict (source, metric) do update set value = excluded.value, changed_at = now()
    `;
    return value;
  }

  /** Cross-server last-good Valorant snapshot, so a fresh dev server can degrade gracefully. */
  async getSnapshot(): Promise<{ data: ValorantData; fetchedAt: Date } | undefined> {
    const [row] = await this.database.client<{ value: unknown; changed_at: string }[]>`
      select value, changed_at from signal_current where source = 'valorant' and metric = 'snapshot'
    `;
    if (!row) return undefined;
    return { data: valorantSchema.parse(row.value), fetchedAt: new Date(row.changed_at) };
  }

  async setSnapshot(data: ValorantData): Promise<void> {
    await this.database.client`
      insert into signal_current (source, metric, value, changed_at)
      values ('valorant', 'snapshot', ${JSON.stringify(data)}::text::jsonb, now())
      on conflict (source, metric) do update set value = excluded.value, changed_at = now()
    `;
  }
}
