import {
  healthIngestBatchSchema,
  healthIngestSchema,
  type HealthIngest,
} from '@nohm/shared';

/**
 * Normalizes either wire shape the Apple Health Shortcut can post — a single day, or a
 * `{ days: [...] }` rolling window — into a flat list of samples. Returns `undefined` when the
 * body matches neither. Shared by the dashboard's own route and the always-on ingest service so
 * the two accept exactly the same payloads.
 */
export function parseHealthIngestBody(body: unknown): HealthIngest[] | undefined {
  const isBatch = typeof body === 'object' && body !== null && 'days' in body;
  const parsed = isBatch ? healthIngestBatchSchema.safeParse(body) : healthIngestSchema.safeParse(body);
  if (!parsed.success) return undefined;
  return 'days' in parsed.data ? parsed.data.days : [parsed.data];
}
