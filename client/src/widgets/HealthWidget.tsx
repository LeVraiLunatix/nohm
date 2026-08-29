import { useState } from 'react';
import type { HealthData, HealthDay } from '@nohm/shared';
import { ActivityRings } from '../components/ActivityRings';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';
import { latestActivityDay } from '../lib/health';

const accent = 'var(--color-accent-personal)';

function Bar({ label, value, goal, unit }: Readonly<{ label: string; value: number; goal: number; unit: string }>) {
  const pct = Math.min(100, goal > 0 ? (value / goal) * 100 : 0);
  const met = value >= goal;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="tabular-nums text-ink-faint">
          <span className="font-semibold text-ink">{value.toLocaleString()}</span> / {goal.toLocaleString()} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-track">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: accent, opacity: met ? 1 : 0.75 }}
        />
      </div>
    </div>
  );
}

function HeartRate({ average, resting, walking }: Readonly<{ average?: number; resting?: number; walking?: number }>) {
  if (average == null && resting == null && walking == null) return null;
  const readings = [
    { label: 'Average', value: average },
    { label: 'Resting', value: resting },
    { label: 'Walking', value: walking },
  ].filter((reading): reading is { label: string; value: number } => reading.value != null);

  return (
    <div className="rounded-2xl bg-track/25 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-rose-500/15 text-rose-400" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M12 20.4 3.7 12.1a5.1 5.1 0 0 1 7.2-7.2L12 6l1.1-1.1a5.1 5.1 0 0 1 7.2 7.2L12 20.4Z" />
          </svg>
        </span>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">Heart rate</p>
      </div>
      <div className={`grid divide-x divide-white/10 ${readings.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {readings.map((reading) => (
          <div key={reading.label} className="px-3 first:pl-0 last:pr-0">
            <p className="flex items-baseline gap-1 tabular-nums leading-none">
              <span className="text-2xl font-semibold text-rose-300">{Math.round(reading.value)}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">bpm</span>
            </p>
            <p className="mt-1 text-xs text-ink-muted">{reading.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecoveryMetrics({ bloodOxygenPercent }: Readonly<{ bloodOxygenPercent?: number }>) {
  const metrics = [
    {
      id: 'oxygen',
      label: 'Blood oxygen',
      value: bloodOxygenPercent == null ? null : `${Math.round(bloodOxygenPercent)}%`,
      tone: 'bg-cyan-400/15 text-cyan-300',
      icon: <path d="M12 3.5S6.5 9.2 6.5 13a5.5 5.5 0 1 0 11 0c0-3.8-5.5-9.5-5.5-9.5Z" />,
    },
  ].filter((metric): metric is { id: string; label: string; value: string; tone: string; icon: React.JSX.Element } => metric.value != null);

  if (metrics.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {metrics.map((metric) => (
        <div key={metric.id} className={`rounded-2xl bg-track/25 px-3 py-2.5 ${metrics.length === 1 ? 'col-span-2' : ''}`}>
          <div className="flex items-center gap-2">
            <span className={`grid h-6 w-6 place-items-center rounded-lg ${metric.tone}`} aria-hidden>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {metric.icon}
              </svg>
            </span>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink-faint">{metric.label}</p>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums leading-none">{metric.value}</p>
        </div>
      ))}
    </div>
  );
}

function StepsTrend({ history, goal }: Readonly<{ history: HealthDay[]; goal: number }>) {
  const [active, setActive] = useState<number | null>(null);
  const days = history.slice(-7);
  if (days.length < 2) return null;
  const max = Math.max(goal, ...days.map((d) => d.steps ?? 0), 1);
  const activeDay = active == null ? null : days[active];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">Steps · last {days.length} days</p>
        {activeDay && (
          <p className="text-[11px] tabular-nums text-ink-muted">
            {new Date(`${activeDay.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
            <span className="font-semibold text-ink">{(activeDay.steps ?? 0).toLocaleString()}</span> steps
          </p>
        )}
      </div>
      <div
        className="flex h-42 items-end gap-1.5"
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setActive(null);
        }}
      >
        {days.map((day, i) => {
          const steps = day.steps ?? 0;
          const height = (steps / max) * 100;
          const met = steps >= goal;
          const weekday = new Date(`${day.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' });
          let opacity = 0.4;
          if (met) opacity = 0.9;
          if (active === i) opacity = 1;
          return (
            <div
              key={day.date}
              className="flex h-full flex-1 cursor-pointer flex-col items-center gap-1"
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            >
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-[3px] transition-opacity"
                  style={{ height: `${Math.max(height, 3)}%`, background: accent, opacity }}
                  aria-label={`${day.date}: ${steps.toLocaleString()} steps`}
                />
              </div>
              <span className={`text-[9px] ${active === i ? 'font-semibold text-ink' : 'text-ink-faint'}`}>{weekday}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HealthBody({ data }: Readonly<{ data: HealthData }>) {
  const t = latestActivityDay(data);
  if (!t && data.history.length === 0) {
    return (
      <p className="text-sm text-ink-faint">
        No health data yet. Set up the Apple Shortcut to post today’s activity — see the README.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {data.today !== t && t && (
        <p className="text-xs text-ink-faint">Showing the last synced activity from {t.date}.</p>
      )}
      <div className="space-y-3">
        <Bar label="Steps" value={t?.steps ?? 0} goal={data.goals.steps} unit="" />
      </div>

      <ActivityRings
        activeEnergyKcal={t?.activeEnergyKcal ?? 0}
        exerciseMinutes={t?.exerciseMinutes ?? 0}
        standHours={t?.standHours ?? 0}
        goals={data.goals}
      />

      <HeartRate average={t?.heartRate} resting={t?.restingHeartRate} walking={t?.walkingHeartRate} />

      <RecoveryMetrics bloodOxygenPercent={t?.bloodOxygenPercent} />

      <StepsTrend history={data.history} goal={data.goals.steps} />

      {data.updatedAt && (
        <p className="text-[11px] text-ink-faint">Synced {relativeTime(data.updatedAt)}</p>
      )}
    </div>
  );
}

export function HealthWidget() {
  const { envelope, offline } = useWidget<HealthData>('health');
  return (
    <WidgetCard title="Health" envelope={envelope} offline={offline}>
      {(data) => <HealthBody data={data} />}
    </WidgetCard>
  );
}
