import type { HealthData } from '@nohm/shared';
import { dateDaysAgo, healthDayFor, iso, mulberry32 } from '@nohm/shared';

// ── Health ───────────────────────────────────────────────────────────────────────────────────

export function health(now: Date): HealthData {
  const rng = mulberry32(20260714);
  const history = Array.from({ length: 30 }, (_, i) => healthDayFor(now, 29 - i, rng));
  const today = { ...healthDayFor(now, 0, rng), date: dateDaysAgo(now, 0), exerciseMinutes: 23, activeEnergyKcal: 650 };
  const restingAvg = history.reduce((sum, d) => sum + d.restingHeartRate!, 0) / history.length;
  const todayResting = today.restingHeartRate!;
  return {
    today, history, updatedAt: iso(now, 0),
    goals: { steps: 9000, activeEnergyKcal: 500, exerciseMinutes: 30, standHours: 12 },
    baseline: {
      windowDays: 30, minimumSamples: 7,
      metrics: {
        restingHeartRate: {
          average: Math.round(restingAvg * 10) / 10, current: todayResting,
          deviationPercent: Math.round(((todayResting - restingAvg) / restingAvg) * 1000) / 10,
          samples: history.length, direction: todayResting >= restingAvg ? 'above' : 'below', anomalous: false,
        },
      },
    },
  };
}

