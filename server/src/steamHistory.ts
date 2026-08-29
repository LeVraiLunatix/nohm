import type { SteamPlaytimeHistoryPoint } from '@nohm/shared';
import type { Database } from './db/client.js';

interface HistoryRow {
  date: string;
  total_playtime_minutes: number;
}

/** Daily cumulative all-time playtime, one row per calendar day — Steam's own library totals are
 * already day-granularity, so unlike ai-usage history there's no sub-day sample throttling here. */
export class SteamHistoryStore {
  constructor(private readonly database: Database) {}

  async record(totalPlaytimeMinutes: number): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);
    await this.database.client`
      insert into steam_playtime_history (date, total_playtime_minutes, recorded_at)
      values (${date}, ${totalPlaytimeMinutes}, now())
      on conflict (date) do update set total_playtime_minutes = excluded.total_playtime_minutes, recorded_at = now()
    `;
  }

  async get(): Promise<SteamPlaytimeHistoryPoint[]> {
    const rows = await this.database.client<HistoryRow[]>`
      select date, total_playtime_minutes from steam_playtime_history order by date asc
    `;
    return rows.map((row) => ({ date: row.date, totalPlaytimeMinutes: row.total_playtime_minutes }));
  }
}
