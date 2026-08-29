import { describe, expect, it } from 'vitest';
import type { TransitData } from '@nohm/shared';
import { transitCandidates } from './transit.js';

describe('transitCandidates', () => {
  const now = Date.parse('2026-07-18T12:00:00+02:00');
  const departure = (expectedTime: string, overrides: Partial<TransitData['stops'][number]['departures'][number]> = {}) => ({
    line: '2', destination: 'Strindheim via Lade', mode: 'bus',
    aimedTime: expectedTime, expectedTime, realtime: true, ...overrides,
  });

  it('surfaces the first departure inside the walkable window as a tile', () => {
    const data: TransitData = {
      stops: [{
        id: 'NSR:StopPlace:41613', name: 'Prinsens gate', distanceMeters: 165,
        departures: [
          departure('2026-07-18T12:01:00+02:00'), // too soon to catch
          departure('2026-07-18T12:07:00+02:00'),
        ],
      }],
    };

    expect(transitCandidates(data, now)).toEqual([expect.objectContaining({
      kicker: 'Next bus', title: '2 · 7 min', detail: 'Strindheim via Lade · from Prinsens gate', shapes: ['tile'],
    })]);
  });

  it('stays quiet when every departure is outside the window', () => {
    const data: TransitData = {
      stops: [{
        id: 'NSR:StopPlace:41613', name: 'Prinsens gate',
        departures: [departure('2026-07-18T13:30:00+02:00')],
      }],
    };

    expect(transitCandidates(data, now)).toEqual([]);
  });
});
