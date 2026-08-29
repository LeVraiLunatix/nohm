import { z } from 'zod';
import { usageHistoryPointSchema, type UsageHistoryPoint } from '@nohm/shared';
import type { Database } from './db/client.js';

const persistedSnapshotSchema = z.object({
  available: z.boolean(),
  fiveHour: z.object({ usedPercent: z.number(), resetsAt: z.string() }).optional(),
  weekly: z.object({ usedPercent: z.number(), resetsAt: z.string() }).optional(),
  modelWeekly: z.object({ usedPercent: z.number(), resetsAt: z.string(), model: z.string() }).optional(),
  fiveHourStatus: z.enum(['limited', 'unlimited', 'unknown']).optional(),
  weeklyStatus: z.enum(['limited', 'unlimited', 'unknown']).optional(),
  tokens: z.object({ fiveHour: z.number(), weekly: z.number() }).optional(),
  asOf: z.string().optional(),
});

export type UsageSnapshot = z.infer<typeof persistedSnapshotSchema>;

/** A zero after positive use, or a large downward jump, is a provider-observed allowance reset. */
export function isUsageReset(previous: number | undefined, current: number | undefined): boolean {
  if (previous === undefined || current === undefined || current >= previous) return false;
  return current === 0 || previous - current >= 40;
}

interface UsagePointRow {
  at: string;
  five_hour_used_percent: number | null;
  five_hour_resets_at: string | null;
  weekly_used_percent: number | null;
  weekly_resets_at: string | null;
  model_weekly_used_percent: number | null;
}

function toPoint(row: UsagePointRow): UsageHistoryPoint {
  return usageHistoryPointSchema.parse({
    at: new Date(row.at).toISOString(),
    fiveHourUsedPercent: row.five_hour_used_percent ?? undefined,
    fiveHourResetsAt: row.five_hour_resets_at ? new Date(row.five_hour_resets_at).toISOString() : undefined,
    weeklyUsedPercent: row.weekly_used_percent ?? undefined,
    weeklyResetsAt: row.weekly_resets_at ? new Date(row.weekly_resets_at).toISOString() : undefined,
    modelWeeklyUsedPercent: row.model_weekly_used_percent ?? undefined,
  });
}

/**
 * How much of the series a read returns.
 *
 * The whole series ships inside the AI-usage widget payload on every poll, and the dashboards read
 * Postgres over Railway's public TCP proxy where that is billed egress — 7,970 sequential scans
 * over 23.4M tuples in four days, measured 2026-08-27. Unbounded, that grows forever for data
 * nothing renders: the widest chart window in `AiDetail.tsx` is 30 days (`MONTH_MS`) and the
 * importance baseline reads at most `baselineWindowDays`, so everything older is fetched, paid for,
 * parsed, and then filtered out client-side.
 *
 * 45 days leaves headroom over both. Rows past it stay in the table — this bounds the read, not the
 * data, so raising the window back up recovers the full series.
 */
const READ_WINDOW_DAYS = 45;

/** Persisted usage time series. Per-tool advisory locks preserve the sample interval across machines. */
export class UsageHistoryStore {
  constructor(
    private readonly database: Database,
    private readonly sampleMs: number,
  ) {}

  async record(toolId: string, snapshot: UsageSnapshot): Promise<UsageHistoryPoint[]> {
    const sql = this.database.client;
    if (!snapshot.available || !snapshot.asOf) return this.get(toolId);
    const at = new Date(snapshot.asOf);
    if (Number.isNaN(at.getTime())) return this.get(toolId);

    return sql.begin(async (transaction) => {
      const lockKey = ['ai-usage', toolId].join(':');
      await transaction`select pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const [last] = await transaction<UsagePointRow[]>`
        select at, five_hour_used_percent, five_hour_resets_at, weekly_used_percent, weekly_resets_at, model_weekly_used_percent
        from ai_usage_history_points where tool_id = ${toolId} order by at desc limit 1
      `;
      const resetObserved = Boolean(last) && (
        isUsageReset(last.five_hour_used_percent ?? undefined, snapshot.fiveHour?.usedPercent)
        || isUsageReset(last.weekly_used_percent ?? undefined, snapshot.weekly?.usedPercent)
      );
      // Keep the regular series compact, but never round a reset boundary away just because it
      // landed inside the normal sampling interval. The graph and command center both need its
      // actual observation timestamp.
      if (!last || at.getTime() - Date.parse(last.at) >= this.sampleMs || resetObserved) {
        await transaction`
          insert into ai_usage_history_points (
            tool_id, at, five_hour_used_percent, five_hour_resets_at, weekly_used_percent, weekly_resets_at, model_weekly_used_percent
          ) values (
            ${toolId}, ${at.toISOString()}, ${snapshot.fiveHour?.usedPercent ?? null}, ${snapshot.fiveHour?.resetsAt ?? null},
            ${snapshot.weekly?.usedPercent ?? null}, ${snapshot.weekly?.resetsAt ?? null}, ${snapshot.modelWeekly?.usedPercent ?? null}
          ) on conflict (tool_id, at) do nothing
        `;
        await transaction`
          insert into ai_usage_snapshots (tool_id, snapshot, updated_at)
          values (${toolId}, ${JSON.stringify(snapshot)}::text::jsonb, now())
          on conflict (tool_id) do update set snapshot = excluded.snapshot, updated_at = now()
        `;
      }
      const points = await transaction<UsagePointRow[]>`
        select at, five_hour_used_percent, five_hour_resets_at, weekly_used_percent, weekly_resets_at, model_weekly_used_percent
        from ai_usage_history_points
        where tool_id = ${toolId} and at >= now() - make_interval(days => ${READ_WINDOW_DAYS})
        order by at asc
      `;
      return points.map(toPoint);
    });
  }

  async get(toolId: string): Promise<UsageHistoryPoint[]> {
    const rows = await this.database.client<UsagePointRow[]>`
      select at, five_hour_used_percent, five_hour_resets_at, weekly_used_percent, weekly_resets_at, model_weekly_used_percent
      from ai_usage_history_points
      where tool_id = ${toolId} and at >= now() - make_interval(days => ${READ_WINDOW_DAYS})
      order by at asc
    `;
    return rows.map(toPoint);
  }

  async getSnapshot(toolId: string): Promise<UsageSnapshot | undefined> {
    const [row] = await this.database.client<{ snapshot: unknown }[]>`
      select snapshot from ai_usage_snapshots where tool_id = ${toolId}
    `;
    return row ? persistedSnapshotSchema.parse(row.snapshot) : undefined;
  }
}
