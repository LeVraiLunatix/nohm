import type { WidgetEnvelope } from '@nohm/shared';

export const fallbackArt = (seed: string) => `https://picsum.photos/seed/${seed}/300/300`;

export function envelope<T>(id: string, data: T, now: Date, refreshMs: number): WidgetEnvelope<T> {
  const at = now.toISOString();
  return { id, status: 'ready', data, fetchedAt: at, lastAttemptAt: at, refreshMs };
}
