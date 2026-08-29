import { describe, expect, it } from 'vitest';
import type { HealthData } from '@nohm/shared';
import { healthCandidates } from './health.js';

describe('healthCandidates', () => {
  it('uses the most recent saved day while today has not synced yet', () => {
    const data: HealthData = {
      today: null,
      history: [{ date: '2026-07-15', steps: 6_800, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 10 }],
      updatedAt: '2026-07-15T23:50:00.000Z',
      goals: { steps: 10_000, activeEnergyKcal: 600, exerciseMinutes: 30, standHours: 12 },
    };

    expect(healthCandidates(data)).toContainEqual(expect.objectContaining({
      id: 'health:activity', kicker: 'Last synced activity', title: '6,800 steps', detail: 'From 2026-07-15', shapes: ['tile'],
    }));
  });

  it('ignores an empty today placeholder in favor of the latest real activity', () => {
    const data: HealthData = {
      today: { date: '2026-07-16' },
      history: [
        { date: '2026-07-15', steps: 6_800, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 10 },
        { date: '2026-07-16' },
      ],
      updatedAt: '2026-07-16T01:00:00.000Z',
      goals: { steps: 10_000, activeEnergyKcal: 600, exerciseMinutes: 30, standHours: 12 },
    };

    expect(healthCandidates(data)).toContainEqual(expect.objectContaining({
      id: 'health:activity', kicker: 'Last synced activity', title: '6,800 steps', detail: 'From 2026-07-15', shapes: ['tile'],
    }));
  });

  it('describes partial activity by the metric that actually arrived', () => {
    const data: HealthData = {
      today: { date: '2026-07-16', activeEnergyKcal: 9 }, history: [{ date: '2026-07-16', activeEnergyKcal: 9 }],
      updatedAt: '2026-07-16T01:00:00.000Z', goals: { steps: 10_000, activeEnergyKcal: 290, exerciseMinutes: 30, standHours: 12 },
    };

    expect(healthCandidates(data)).toContainEqual(expect.objectContaining({
      id: 'health:activity', title: '9 active kcal', detail: 'Open Health for the full activity rings',
    }));
  });

  it('shows the actual metric for a genuine health baseline anomaly', () => {
    const data: HealthData = {
      today: { date: '2026-07-16', restingHeartRate: 80 },
      history: [],
      updatedAt: '2026-07-16T12:00:00.000Z',
      goals: { steps: 10_000, activeEnergyKcal: 290, exerciseMinutes: 30, standHours: 12 },
      baseline: {
        windowDays: 7,
        minimumSamples: 3,
        metrics: {
          restingHeartRate: { average: 60, current: 80, deviationPercent: 33, samples: 7, direction: 'above', anomalous: true },
        },
      },
    };

    expect(healthCandidates(data)).toContainEqual(expect.objectContaining({
      id: 'health:baseline:restingHeartRate',
      title: 'Resting Heart Rate 33% above',
      render: { type: 'text' },
    }));
  });
});
