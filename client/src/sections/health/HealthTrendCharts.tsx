import { useMemo, useState } from 'react';
import type { HealthData, HealthDay } from '@nohm/shared';

const W = 100;
const H = 36;
const DAY_MS = 86_400_000;

type MetricKey =
  | 'steps'
  | 'activeEnergyKcal'
  | 'exerciseMinutes'
  | 'standHours'
  | 'heartRate'
  | 'restingHeartRate'
  | 'walkingHeartRate'
  | 'bloodOxygenPercent';

interface SeriesDef {
  key: MetricKey;
  label: string;
  color: string;
}

/** A calendar day in the charted window; `day` is null on days the phone never synced. */
interface Slot {
  date: string;
  day: HealthDay | null;
}

/**
 * Per-mode series colors via light-dark(). The heart-rate trio was checked with the
 * dataviz palette validator (lightness band, chroma floor, CVD separation, contrast
 * vs surface) in both modes; the single-series colors echo the widget's ring accents.
 */
const HR_SERIES: SeriesDef[] = [
  { key: 'heartRate', label: 'Average', color: 'light-dark(#d9385a, #f43f5e)' },
  { key: 'restingHeartRate', label: 'Resting', color: 'light-dark(#3b6fd4, #5b87e5)' },
  { key: 'walkingHeartRate', label: 'Walking', color: 'light-dark(#b45309, #d97706)' },
];
const OXYGEN_SERIES: SeriesDef[] = [
  { key: 'bloodOxygenPercent', label: 'SpO₂', color: 'light-dark(#0e7490, #22d3ee)' },
];

const fmt = (v: number) => Math.round(v).toLocaleString();
const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fullDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/** Expand history into one slot per calendar day so gaps keep their width on the time axis. */
function buildSlots(history: HealthDay[], windowDays: number): Slot[] {
  const days = history.slice(-windowDays);
  if (days.length === 0) return [];
  const byDate = new Map(days.map((day) => [day.date, day]));
  const start = Date.parse(`${days[0].date}T12:00:00`);
  const end = Date.parse(`${days.at(-1)!.date}T12:00:00`);
  const slots: Slot[] = [];
  for (let t = start; t <= end + DAY_MS / 2; t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10);
    slots.push({ date, day: byDate.get(date) ?? null });
  }
  return slots;
}

function ChartFooter({
  readout,
  slots,
}: Readonly<{ readout: string; slots: Slot[] }>) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-2">
      <p className="min-w-0 truncate text-[11px] tabular-nums text-ink-muted">{readout}</p>
      <p className="shrink-0 text-[9px] text-ink-faint">
        {shortDate(slots[0].date)} – {shortDate(slots.at(-1)!.date)}
      </p>
    </div>
  );
}

/** Daily-total columns on a time axis, with an optional dashed goal threshold. */
function BarTrend({
  title,
  unit,
  color,
  slots,
  metric,
  goal,
}: Readonly<{
  title: string;
  unit: string;
  color: string;
  slots: Slot[];
  metric: MetricKey;
  goal?: number;
}>) {
  const [active, setActive] = useState<number | null>(null);
  const values = slots.map((slot) => slot.day?.[metric]);
  const defined = values.filter((v): v is number => v != null);
  if (defined.length === 0) return null;
  const max = Math.max(goal ?? 0, ...defined);
  const avg = defined.reduce((a, b) => a + b, 0) / defined.length;
  const activeValue = active == null ? undefined : values[active];
  const readout =
    active != null && activeValue != null
      ? `${fmt(activeValue)}${unit} · ${fullDate(slots[active].date)}`
      : `avg ${fmt(avg)}${unit}/day`;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{title}</p>
        {goal != null && <p className="text-[10px] tabular-nums text-ink-faint">goal {fmt(goal)}{unit}</p>}
      </div>
      <div className="relative">
        {goal != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 z-10"
            style={{
              bottom: `${(goal / max) * 100}%`,
              borderTop: `1px dashed color-mix(in oklab, ${color} 55%, transparent)`,
            }}
          />
        )}
        <div
          className="flex h-28 items-end gap-0.5"
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setActive(null);
          }}
        >
          {slots.map((slot, i) => {
            const value = values[i];
            const met = goal != null && value != null && value >= goal;
            let opacity = 0.45;
            if (met || goal == null) opacity = 0.85;
            if (active === i) opacity = 1;
            return (
              <div
                key={slot.date}
                className="flex h-full flex-1 cursor-pointer items-end"
                onPointerEnter={() => value != null && setActive(i)}
                onPointerDown={() => value != null && setActive(i)}
              >
                {value != null && (
                  <div
                    className="w-full rounded-t-[2px] transition-opacity"
                    style={{
                      height: `${Math.max((value / max) * 100, 2)}%`,
                      background: color,
                      opacity,
                    }}
                    aria-label={`${slot.date}: ${fmt(value)}${unit}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <ChartFooter readout={readout} slots={slots} />
    </div>
  );
}

interface ChartPoint {
  index: number;
  x: number;
  y: number;
  value: number;
}

interface ChartSegment {
  start: ChartPoint;
  end: ChartPoint;
  spansMissingDays: boolean;
}

/**
 * One-or-more line series on a shared time axis. Gaps between measurements use a
 * dashed join so sparse metrics remain readable without implying daily samples.
 */
function LineTrend({
  title,
  unit,
  slots,
  series,
  niceStep,
  domainMax,
}: Readonly<{
  title: string;
  unit: string;
  slots: Slot[];
  series: SeriesDef[];
  niceStep: number;
  domainMax?: number;
}>) {
  const [active, setActive] = useState<number | null>(null);
  const all = series.flatMap((s) =>
    slots.map((slot) => slot.day?.[s.key]).filter((v): v is number => v != null),
  );
  if (all.length === 0) return null;

  let min = Math.floor(Math.min(...all) / niceStep) * niceStep;
  if (min === Math.min(...all)) min -= niceStep;
  let max = domainMax ?? Math.ceil(Math.max(...all) / niceStep) * niceStep;
  if (max <= min) max = min + niceStep;
  const xAt = (i: number) => ((i + 0.5) / slots.length) * W;
  const yAt = (v: number) => H - ((v - min) / (max - min)) * H;

  const lines = series.map((s) => {
    const points: ChartPoint[] = [];
    slots.forEach((slot, i) => {
      const value = slot.day?.[s.key];
      if (value != null) points.push({ index: i, x: xAt(i), y: yAt(value), value });
    });
    const segments: ChartSegment[] = points.slice(1).map((point, i) => ({
      start: points[i],
      end: point,
      spansMissingDays: point.index - points[i].index > 1,
    }));
    return { ...s, points, segments };
  });

  const readNearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const i = Math.min(
      slots.length - 1,
      Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * slots.length)),
    );
    setActive(series.some((s) => slots[i].day?.[s.key] != null) ? i : null);
  };

  const valuesAt = (i: number) =>
    series
      .map((s) => {
        const value = slots[i].day?.[s.key];
        return value == null ? null : `${fmt(value)} ${s.label.toLowerCase()}`;
      })
      .filter((part): part is string => part != null)
      .join(' · ');
  const latest = [...slots].reverse().find((slot) => series.some((s) => slot.day?.[s.key] != null));
  let readout = '';
  if (active != null) {
    readout = `${valuesAt(active)} · ${fullDate(slots[active].date)}`;
  } else if (latest) {
    readout = `latest: ${valuesAt(slots.indexOf(latest))}`;
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{title}</p>
        <p className="text-[10px] tabular-nums text-ink-faint">{min}–{max} {unit}</p>
      </div>
      {series.length > 1 && (
        <div className="mb-1.5 flex gap-3">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[10px] text-ink-muted">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-28 w-full touch-none"
          aria-label={`${title}, last ${slots.length} days`}
          onPointerMove={readNearest}
          onPointerDown={readNearest}
          onPointerLeave={() => setActive(null)}
        >
          {[0, H / 2, H].map((y) => (
            <line
              key={y}
              x1={0}
              y1={y}
              x2={W}
              y2={y}
              stroke="var(--color-card-border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {lines.map((line) =>
            <g key={line.key}>
              {line.segments.map((segment) => (
                <path
                  key={`${segment.start.index}-${segment.end.index}`}
                  d={`M${segment.start.x},${segment.start.y} L${segment.end.x},${segment.end.y}`}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={2}
                  strokeDasharray={segment.spansMissingDays ? '3 3' : undefined}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {line.points.map((point) => (
                <path
                  key={point.index}
                  // A zero-length round-capped stroke renders as a circular dot even
                  // though preserveAspectRatio="none" would distort a <circle>.
                  d={`M${point.x},${point.y} l0.01,0`}
                  stroke={line.color}
                  strokeWidth={4}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>,
          )}
        </svg>
        {active != null &&
          series.map((s) => {
            const value = slots[active].day?.[s.key];
            if (value == null) return null;
            return (
              <span
                key={s.key}
                className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${(xAt(active) / W) * 100}%`,
                  top: `${(yAt(value) / H) * 100}%`,
                  background: s.color,
                  boxShadow: '0 0 0 2px var(--color-canvas)',
                }}
              />
            );
          })}
      </div>
      <ChartFooter readout={readout} slots={slots} />
    </div>
  );
}

export function HealthTrendCharts({
  history,
  goals,
}: Readonly<{ history: HealthDay[]; goals: HealthData['goals'] }>) {
  const slots = useMemo(() => buildSlots(history, 30), [history]);
  if (slots.length < 2) {
    return <p className="text-sm text-ink-faint">Trends unlock once a couple of days have synced.</p>;
  }
  return (
    <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
      <BarTrend title="Steps" unit="" color="var(--color-accent-personal)" slots={slots} metric="steps" goal={goals.steps} />
      <BarTrend title="Move" unit=" kcal" color="light-dark(#d91f3b, #ff5a8b)" slots={slots} metric="activeEnergyKcal" goal={goals.activeEnergyKcal} />
      <BarTrend title="Exercise" unit=" min" color="light-dark(#4d8c00, #70cc00)" slots={slots} metric="exerciseMinutes" goal={goals.exerciseMinutes} />
      <BarTrend title="Stand" unit=" hrs" color="light-dark(#00758a, #00b7cb)" slots={slots} metric="standHours" goal={goals.standHours} />
      <LineTrend title="Heart rate" unit="bpm" slots={slots} series={HR_SERIES} niceStep={10} />
      <LineTrend title="Blood oxygen" unit="%" slots={slots} series={OXYGEN_SERIES} niceStep={1} domainMax={100} />
    </div>
  );
}
