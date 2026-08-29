import { useEffect, useState } from 'react';
import type { PowerData, PowerHour } from '@nohm/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';

const CHART_W = 100;
const CHART_H = 30;
/** Gap between bars in viewBox units — reads as a hairline at any rendered width. */
const BAR_GAP = 0.35;

function currentHourIndex(hours: PowerHour[], now: number): number {
  return hours.findIndex((hour) => {
    const start = Date.parse(hour.time);
    return now >= start && now < start + 60 * 60_000;
  });
}

function activeHourContext(active: number, todayLength: number, hourLabel: string): string {
  const day = active >= todayLength ? 'tomorrow' : 'today';
  return `/kWh · ${day} ${hourLabel}:00`;
}

/** Re-derive "the current hour" as the clock crosses hour boundaries between polls. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

const kr = (price: number) => `${price.toFixed(2)} kr`;

/**
 * One sequential hue for the whole curve (magnitude, single series); the only color break is
 * the current hour in the section accent. Negative prices (they happen) hang below a zero line.
 * Bars are hoverable (and tappable) like the health widget's steps trend — the active bar is
 * reported up so the header above the chart can show its exact price instead of "now"'s.
 */
function PriceChart({ hours, nowIndex, todayCount, active, onActiveChange }: Readonly<{
  hours: PowerHour[];
  nowIndex: number;
  todayCount: number;
  active: number | null;
  onActiveChange: (index: number | null) => void;
}>) {
  const prices = hours.map((hour) => hour.priceNokPerKwh);
  const max = Math.max(...prices, 0.01);
  const min = Math.min(...prices, 0);
  const yOf = (price: number) => CHART_H - ((price - min) / (max - min)) * CHART_H;
  const barW = CHART_W / hours.length - BAR_GAP;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="h-16 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Hourly electricity price"
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') onActiveChange(null);
      }}
    >
      {hours.map((hour, index) => {
        const x = (index / hours.length) * CHART_W;
        const zeroY = yOf(0);
        const priceY = yOf(hour.priceNokPerKwh);
        const y = Math.min(priceY, zeroY);
        const height = Math.max(Math.abs(zeroY - priceY), 0.75);
        const isNow = index === nowIndex;
        const isTomorrow = index >= todayCount;
        let fill = 'var(--color-ink-faint)';
        let opacity = isTomorrow ? 0.28 : 0.5;
        if (isNow) {
          fill = 'var(--color-accent-personal)';
          opacity = 1;
        } else if (active === index) {
          fill = 'var(--color-ink)';
          opacity = 0.9;
        }
        return (
          <rect
            key={hour.time}
            x={x}
            y={y}
            width={barW}
            height={height}
            rx={0.5}
            fill={fill}
            opacity={opacity}
            className="cursor-pointer"
            aria-label={`${isTomorrow ? 'Tomorrow' : 'Today'} ${hour.hourLabel}:00 · ${kr(hour.priceNokPerKwh)}/kWh`}
            onPointerEnter={() => onActiveChange(index)}
            onPointerDown={() => onActiveChange(index)}
          />
        );
      })}
      {min < 0 && (
        <line x1="0" x2={CHART_W} y1={yOf(0)} y2={yOf(0)} stroke="var(--color-card-border)" strokeWidth="0.4" />
      )}
    </svg>
  );
}

export function PowerWidget() {
  const { envelope, offline } = useWidget<PowerData>('power');
  const now = useNow();
  const [active, setActive] = useState<number | null>(null);

  return (
    <WidgetCard title="Power price" envelope={envelope} offline={offline}>
      {(data) => {
        const hours = [...data.today, ...data.tomorrow];
        const nowIndex = currentHourIndex(hours, now);
        const current = nowIndex >= 0 ? hours[nowIndex] : undefined;
        const activeHour = active != null ? hours[active] : undefined;
        const displayed = activeHour ?? current;
        const sortedToday = [...data.today].sort((a, b) => a.priceNokPerKwh - b.priceNokPerKwh);
        const low = sortedToday[0];
        const high = sortedToday.at(-1);

        return (
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-[-0.04em] tabular-nums">
                {displayed ? kr(displayed.priceNokPerKwh) : '–'}
              </span>
              <span className="text-xs text-ink-faint">
                {activeHour && active !== null
                  ? activeHourContext(active, data.today.length, activeHour.hourLabel)
                  : `/kWh · ${data.area} spot`}
              </span>
            </p>
            <div className="mt-3">
              <PriceChart hours={hours} nowIndex={nowIndex} todayCount={data.today.length} active={active} onActiveChange={setActive} />
              <div className="mt-1 flex justify-between text-[0.65rem] text-ink-faint">
                <span>Today</span>
                {data.tomorrow.length > 0 && <span>Tomorrow</span>}
              </div>
            </div>
            {low && high && (
              <p className="mt-2 text-xs text-ink-muted">
                Today {kr(low.priceNokPerKwh)} at {low.hourLabel}:00 · up to {kr(high.priceNokPerKwh)} at {high.hourLabel}:00
              </p>
            )}
            <p className="mt-3 text-[0.65rem] text-ink-faint">
              <a href="https://www.hvakosterstrommen.no" target="_blank" rel="noreferrer" className="hover:underline">
                Strømpriser levert av Hva koster strømmen.no
              </a>
            </p>
          </div>
        );
      }}
    </WidgetCard>
  );
}
