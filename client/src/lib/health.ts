import type { HealthData, HealthDay } from '@nohm/shared';

/** Ignore placeholder daily rows created by a partial Shortcut run with no usable readings. */
export function hasActivityData(day: HealthDay): boolean {
  return [day.steps, day.activeEnergyKcal, day.exerciseMinutes, day.standHours]
    .some((value) => value !== undefined && value > 0);
}

/** Keep the dashboard useful overnight when the current day has only an empty placeholder row. */
export function latestActivityDay(data: HealthData): HealthDay | undefined {
  if (data.today && hasActivityData(data.today)) return data.today;
  return [...data.history].reverse().find(hasActivityData);
}

/** Calendar-day wording for an activity total, keeping midnight and daylight-saving changes out of the math. */
export function relativeActivityDay(date: string, now = new Date()): string {
  const [year, month, day] = date.split('-').map(Number);
  const activityDay = Date.UTC(year, month - 1, day);
  const currentDay = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = Math.round((currentDay - activityDay) / 86_400_000);
  if (daysAgo === 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo > 1) return `${daysAgo} days ago`;
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** The activity total's day is distinct from the moment its Shortcut last reached the dashboard. */
export function activitySyncContext(date: string, updatedAt: string | null): string {
  const activityAge = relativeActivityDay(date);
  if (!updatedAt) return `From ${activityAge}`;
  const syncedAt = new Date(updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `From ${activityAge} · synced at ${syncedAt}`;
}
