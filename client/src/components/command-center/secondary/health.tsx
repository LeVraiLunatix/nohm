import type { ReactNode } from 'react';
import type { CommandCenterSlot, HealthData } from '@nohm/shared';
import { activitySyncContext, latestActivityDay } from '../../../lib/health';
import { ActivityRings } from '../../ActivityRings';

export function HealthRingsSecondary({ slot, health }: Readonly<{ slot: CommandCenterSlot; health: HealthData | undefined }>): ReactNode {
  const activityDay = health ? latestActivityDay(health) : undefined;
  if (slot.render.type !== 'health-rings' || !health || !activityDay) return null;
  const detail = health.today?.date === activityDay.date
    ? slot.detail
    : activitySyncContext(activityDay.date, health.updatedAt);
  return <div className="mt-4">
    <ActivityRings
      activeEnergyKcal={activityDay.activeEnergyKcal ?? 0}
      exerciseMinutes={activityDay.exerciseMinutes ?? 0}
      standHours={activityDay.standHours ?? 0}
      goals={health.goals}
    />
    <p className="mt-2 text-[11px] text-ink-faint">{detail}</p>
  </div>;
}
