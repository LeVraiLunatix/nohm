import { useEffect, useId, useState } from 'react';
import type { HealthData, HealthDay } from '@nohm/shared';
import { animate, motion, useMotionValue } from 'motion/react';
import { CompactActivityRings } from '../../components/ActivityRings';
import { WidgetBody } from '../../components/WidgetCard';
import { useWidget } from '../../useWidget';
import { latestActivityDay } from '../../lib/health';
import { useI18n } from '../../i18n/I18nProvider';

const STEPS_COLOR = 'var(--color-accent-personal)';

/** Same entity colors as the 30-day trend charts, so a metric keeps its hue everywhere. */
const VITALS = [
  { key: 'heartRate', label: 'Average', unit: 'bpm', color: 'light-dark(#d9385a, #f43f5e)' },
  { key: 'restingHeartRate', label: 'Resting', unit: 'bpm', color: 'light-dark(#3b6fd4, #5b87e5)' },
  { key: 'walkingHeartRate', label: 'Walking', unit: 'bpm', color: 'light-dark(#b45309, #d97706)' },
  { key: 'bloodOxygenPercent', label: 'SpO₂', unit: '%', color: 'light-dark(#0e7490, #22d3ee)' },
] as const;

type VitalKey = (typeof VITALS)[number]['key'];

/** The hero steps figure counts up on mount: arrival, not decoration. */
function CountUp({ value }: Readonly<{ value: number }>) {
  const progress = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const controls = animate(progress, value, { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    const unsubscribe = progress.on('change', (v) => setDisplay(Math.round(v)));
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [value, progress]);
  return <>{display.toLocaleString()}</>;
}

/** Steps hero and the fitness rings share one card — the rings stay full size, no Move/Exercise/Stand legend. */
function StepsAndFitness({
  steps,
  goal,
  isToday,
  today,
  goals,
}: Readonly<{ steps: number; goal: number; isToday: boolean; today: HealthDay; goals: HealthData['goals'] }>) {
  const progress = Math.min(100, goal > 0 ? (steps / goal) * 100 : 0);
  return (
    <div className="rounded-2xl bg-track/25 p-3.5">
      <div className="flex items-center gap-4">
        <CompactActivityRings
          activeEnergyKcal={today.activeEnergyKcal ?? 0}
          exerciseMinutes={today.exerciseMinutes ?? 0}
          standHours={today.standHours ?? 0}
          goals={goals}
          size={128}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
              {isToday ? 'Today’s steps' : 'Last synced steps'}
            </p>
            <span className="shrink-0 rounded-full bg-(--color-accent-personal)/12 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-(--color-accent-personal)">
              {Math.round(progress)}%
            </span>
          </div>
          <p className="mt-1 text-3xl font-semibold tracking-[-0.05em]">
            <CountUp value={steps} />
          </p>
          <p className="mt-1 text-xs text-ink-muted">of {goal.toLocaleString()} step goal</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full"
          style={{ background: STEPS_COLOR }}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
      </div>
    </div>
  );
}

/** The last week of steps as columns against the goal; hover or tap a day for its exact count. */
function WeekOfSteps({ history, goal }: Readonly<{ history: HealthDay[]; goal: number }>) {
  const [active, setActive] = useState<number | null>(null);
  const days = history.slice(-7);
  if (days.length < 2) {
    return (
      <div className="grid place-items-center rounded-2xl bg-track/25 p-3.5 text-xs text-ink-faint">
        The week chart unlocks after a couple of synced days.
      </div>
    );
  }
  const max = Math.max(goal, ...days.map((d) => d.steps ?? 0), 1);
  const activeDay = active == null ? null : days[active];
  const total = days.reduce((sum, d) => sum + (d.steps ?? 0), 0);
  const activeDate = activeDay ? new Date(`${activeDay.date}T12:00:00`) : null;
  const activeReadout = activeDay && activeDate
    ? `${activeDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${(activeDay.steps ?? 0).toLocaleString()} steps`
    : null;
  const readout = activeDay
    ? activeReadout
    : `${total.toLocaleString()} steps this week`;

  return (
    <div className="flex min-w-0 flex-col rounded-2xl bg-track/25 p-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">Steps · last {days.length} days</p>
        <p className="truncate text-[11px] tabular-nums text-ink-muted">{readout}</p>
      </div>
      <div className="relative min-h-24 flex-1">
        {/* Goal threshold across the whole bar area */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 z-10"
          style={{
            bottom: `${(goal / max) * 100}%`,
            borderTop: `1px dashed color-mix(in oklab, ${STEPS_COLOR} 55%, transparent)`,
          }}
        />
        <div
          className="flex h-full items-end gap-1.5"
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setActive(null);
          }}
        >
          {days.map((day, i) => {
            const steps = day.steps ?? 0;
            const met = steps >= goal;
            let opacity = 0.4;
            if (met) opacity = 0.9;
            if (active === i) opacity = 1;
            return (
              <div
                key={day.date}
                className="flex h-full flex-1 cursor-pointer items-end justify-center"
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
              >
                <motion.div
                  className="w-full max-w-6 rounded-t-[4px]"
                  style={{ background: STEPS_COLOR, opacity }}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max((steps / max) * 100, 3)}%` }}
                  transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                  aria-label={`${day.date}: ${steps.toLocaleString()} steps`}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-1.5">
        {days.map((day, i) => (
          <span
            key={day.date}
            className={`flex-1 text-center text-[9px] ${active === i ? 'font-semibold text-ink' : 'text-ink-faint'}`}
          >
            {new Date(`${day.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'narrow' })}
          </span>
        ))}
      </div>
    </div>
  );
}

/** ~2-week single-series sparkline; the metric's identity comes from the dot + label beside it. */
function VitalSparkline({ history, metric, color }: Readonly<{ history: HealthDay[]; metric: VitalKey; color: string }>) {
  const revealId = `${useId().replaceAll(':', '')}-vital-reveal`;
  const values = history
    .slice(-14)
    .map((day) => day[metric])
    .filter((v): v is number => v != null);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const W = 96;
  const H = 18;
  const xAt = (i: number) => (i / (values.length - 1)) * W;
  const yAt = (v: number) => 2 + (H - 4) * (1 - (v - min) / span);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-5 w-full" aria-hidden>
      <defs>
        {/* Left-to-right reveal via a clip, not pathLength: pathLength's dasharray is measured
            in screen space, which fragments into gaps once vector-effect="non-scaling-stroke"
            and preserveAspectRatio="none" stretch this non-uniformly (see HourSparkline). */}
        <clipPath id={revealId}>
          <motion.rect
            x="0"
            y="0"
            height={H}
            initial={{ width: 0 }}
            animate={{ width: W }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.4 }}
          />
        </clipPath>
      </defs>
      <g clipPath={`url(#${revealId})`}>
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.55}
        />
      </g>
    </svg>
  );
}

/** Walks backward so a vital missing only from the latest synced day still shows its last known reading. */
function latestVitalReading(history: HealthDay[], metric: VitalKey): { value: number; date: string } | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const value = history[i][metric];
    if (value != null) return { value, date: history[i].date };
  }
  return undefined;
}

function Vitals({ today, history }: Readonly<{ today: HealthDay; history: HealthDay[] }>) {
  const readings = VITALS.map((vital) => {
    const latest = latestVitalReading(history, vital.key);
    return latest ? { ...vital, value: latest.value, isStale: latest.date !== today.date } : null;
  }).filter((vital): vital is (typeof VITALS)[number] & { value: number; isStale: boolean } => vital != null);
  if (readings.length === 0) return null;
  return (
    <div className="rounded-2xl bg-track/25 p-3.5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-rose-500/15 text-rose-400" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
            <path d="M12 20.4 3.7 12.1a5.1 5.1 0 0 1 7.2-7.2L12 6l1.1-1.1a5.1 5.1 0 0 1 7.2 7.2L12 20.4Z" />
          </svg>
        </span>
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">Vitals · 2-week trend</p>
      </div>
      <div className="space-y-2">
        {readings.map((vital, i) => (
          <motion.div
            key={vital.key}
            className="flex items-center gap-2.5"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: vital.color }} />
            <span className="w-14 shrink-0 text-xs text-ink-muted">{vital.label}</span>
            <span
              className={`w-16 shrink-0 text-sm font-semibold tabular-nums ${vital.isStale ? 'text-ink-muted' : ''}`}
              title={vital.isStale ? 'No reading synced today — showing the last known value' : undefined}
            >
              {Math.round(vital.value)} <span className="text-[10px] font-medium text-ink-faint">{vital.unit}</span>
            </span>
            <span className="min-w-0 flex-1">
              <VitalSparkline history={history} metric={vital.key} color={vital.color} />
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function HealthOverview() {
  const { t } = useI18n();
  const { envelope, offline } = useWidget<HealthData>('health');
  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => {
        const today = latestActivityDay(data);
        if (!today) return <p className="text-sm text-ink-faint">{t('health.firstSync')}</p>;
        const isToday = data.today === today;
        return (
          <div className="grid gap-3 lg:grid-cols-3">
            <StepsAndFitness
              steps={today.steps ?? 0}
              goal={data.goals.steps}
              isToday={isToday}
              today={today}
              goals={data.goals}
            />
            <WeekOfSteps history={data.history} goal={data.goals.steps} />
            <Vitals today={today} history={data.history} />
          </div>
        );
      }}
    </WidgetBody>
  );
}
