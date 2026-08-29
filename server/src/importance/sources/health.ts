import type { HealthData } from '@nohm/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

function hasActivityData(day: HealthData['history'][number]): boolean {
  return [day.steps, day.activeEnergyKcal, day.exerciseMinutes, day.standHours]
    .some((value) => value !== undefined && value > 0);
}

function activitySummary(day: HealthData['history'][number]): { title: string; detail: string } {
  if (day.steps !== undefined) {
    return {
      title: `${Math.round(day.steps).toLocaleString('en-US')} steps`,
      detail: 'Open Health for the full activity rings',
    };
  }
  if (day.activeEnergyKcal !== undefined) {
    return {
      title: `${Math.round(day.activeEnergyKcal)} active kcal`,
      detail: [
        day.exerciseMinutes !== undefined && `${Math.round(day.exerciseMinutes)} min exercise`,
        day.standHours !== undefined && `${Math.round(day.standHours)} stand hrs`,
      ].filter((value): value is string => Boolean(value)).join(' · ') || 'Open Health for the full activity rings',
    };
  }
  if (day.exerciseMinutes !== undefined) return { title: `${Math.round(day.exerciseMinutes)} min exercise`, detail: 'Open Health for the full activity rings' };
  return { title: `${Math.round(day.standHours ?? 0)} stand hrs`, detail: 'Open Health for the full activity rings' };
}

export function healthCandidates(data: HealthData | undefined): Candidate[] {
  if (!data) return [];
  const candidates: Candidate[] = [];
  const anomaly = Object.entries(data.baseline?.metrics ?? {}).find(([, metric]) => metric.anomalous);
  if (anomaly) {
    const [metric, value] = anomaly;
    candidates.push({
      id: `health:baseline:${metric}`, source: 'health', kind: 'health', score: 82, shapes: [...allShapes],
      kicker: 'Personal baseline', title: `${metric.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()} ${value.deviationPercent.toFixed(0)}% ${value.direction}`,
      detail: `${value.current.toFixed(0)} today · usual ${value.average.toFixed(0)} across ${value.samples} days`,
      href: '#/health', render: { type: 'text' },
    });
  }
  const steps = data.today?.steps;
  if (steps !== undefined && steps >= data.goals.steps) {
    candidates.push({
      id: 'health:steps-goal', source: 'health', kind: 'health', score: 63, shapes: ['secondary', 'tile'],
      kicker: 'Goal reached', title: `${Math.round(steps).toLocaleString('en-US')} steps`,
      detail: `${Math.round((steps / data.goals.steps) * 100)}% of your daily goal`, href: '#/health', render: { type: 'health-rings' },
    });
  }
  const hasTodayActivity = data.today !== null && hasActivityData(data.today);
  const activityDay = hasTodayActivity ? data.today : [...data.history].reverse().find(hasActivityData);
  if (activityDay) {
    const activity = activitySummary(activityDay);
    candidates.push({
      id: 'health:activity', source: 'health', kind: 'health', score: hasTodayActivity ? 32 : 34, shapes: ['tile'],
      kicker: hasTodayActivity ? "Today's activity" : 'Last synced activity',
      title: activity.title,
      detail: hasTodayActivity ? activity.detail : `From ${activityDay.date}`,
      href: '#/health', render: { type: 'health-rings' },
    });
  }
  return candidates;
}
