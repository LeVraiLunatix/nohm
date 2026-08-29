import type { TransitData } from '@nohm/shared';

import type { Candidate } from '../types.js';

/** Next departure worth walking for: not so soon you'd miss it, not so far out it's noise. */
const TRANSIT_MIN_LEAD_MS = 2 * 60_000;
const TRANSIT_MAX_LEAD_MS = 45 * 60_000;

export function transitCandidates(data: TransitData | undefined, now = Date.now()): Candidate[] {
  for (const stop of data?.stops ?? []) {
    const departure = stop.departures.find((entry) => {
      const lead = Date.parse(entry.expectedTime) - now;
      return lead >= TRANSIT_MIN_LEAD_MS && lead <= TRANSIT_MAX_LEAD_MS;
    });
    if (!departure) continue;
    const minutes = Math.round((Date.parse(departure.expectedTime) - now) / 60_000);
    return [{
      id: `transit:${stop.id}:${departure.line}:${departure.expectedTime}`, source: 'transit', kind: 'transit',
      score: 21, shapes: ['tile'], kicker: `Next ${departure.mode}`,
      title: `${departure.line} · ${minutes} min`,
      detail: `${departure.destination} · from ${stop.name}`,
      href: '#/personal/transit', render: { type: 'text' },
    }];
  }
  return [];
}
