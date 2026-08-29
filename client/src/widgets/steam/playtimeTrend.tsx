import { useState } from 'react';
import type { SteamData } from '@nohm/shared';
import { accent } from './shared';

const PLAYTIME_TREND_WINDOW_DAYS = 30;

interface PlaytimeSlot {
  date: string;
  hours: number;
}

/** Steam only reports cumulative all-time playtime, day-granularity — the trend chart derives
 * day-over-day deltas from consecutive samples rather than a native per-day breakdown. Clamped at
 * 0 so a cache/library correction never renders as negative playtime. */
function buildPlaytimeSlots(history: SteamData['playtimeHistory'], windowDays: number): PlaytimeSlot[] {
  const recent = history.slice(-(windowDays + 1));
  const slots: PlaytimeSlot[] = [];
  for (let i = 1; i < recent.length; i++) {
    const delta = recent[i].totalPlaytimeMinutes - recent[i - 1].totalPlaytimeMinutes;
    slots.push({ date: recent[i].date, hours: Math.max(delta, 0) / 60 });
  }
  return slots;
}

const trendDateFmt = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Daily playtime bars over the trailing month, derived from cumulative history samples. Same
 * header/chart/axis/readout structure as the weather overview sparkline (hover crosshair aside —
 * bars already carry position, so a redundant vertical line would just clutter a discrete chart). */
export function SteamPlaytimeTrend({ data }: Readonly<{ data: SteamData }>) {
  const [active, setActive] = useState<number | null>(null);
  const slots = buildPlaytimeSlots(data.playtimeHistory, PLAYTIME_TREND_WINDOW_DAYS);
  if (slots.length === 0) {
    return <p className="text-sm text-ink-faint">Trends unlock once a couple of days have synced.</p>;
  }
  const W = 100;
  const H = 40;
  const totalHours = slots.reduce((sum, s) => sum + s.hours, 0);
  const max = Math.max(...slots.map((s) => s.hours), 0.001);
  const peakIndex = totalHours > 0 ? slots.reduce((best, s, i) => (s.hours > slots[best].hours ? i : best), 0) : null;
  const midIndex = Math.floor((slots.length - 1) / 2);
  const barW = Math.min(2.6, (W / slots.length) * 0.62);
  const xAt = (i: number) => (i + 0.5) * (W / slots.length);

  const activeSlot = active != null ? slots[active] : null;
  const readout = activeSlot
    ? `${activeSlot.hours.toFixed(1)}h · ${trendDateFmt(activeSlot.date)}`
    : `${totalHours.toFixed(1)}h total · last ${slots.length} days`;

  const readNearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const i = Math.min(slots.length - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * slots.length)));
    setActive(i);
  };

  return (
    <div className="steam-trend-panel">
      <div className="steam-trend-header">
        <span>Last {slots.length} days</span>
        <span>{peakIndex != null ? `peak ${slots[peakIndex].hours.toFixed(1)}h · ${trendDateFmt(slots[peakIndex].date)}` : 'No activity yet'}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="steam-trend-chart"
        aria-label="Daily playtime over the last month"
        onPointerMove={readNearest}
        onPointerDown={readNearest}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setActive(null);
        }}
      >
        <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke="var(--color-card-border)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {slots.map((slot, i) => {
          if (slot.hours <= 0) return null;
          const height = Math.max((slot.hours / max) * (H - 6), 2);
          return (
            <rect
              key={slot.date}
              x={xAt(i) - barW / 2}
              y={H - height}
              width={barW}
              height={height}
              rx={0.8}
              fill={accent}
              opacity={active === i ? 1 : 0.62}
              aria-label={`${slot.date}: ${slot.hours.toFixed(1)}h`}
            />
          );
        })}
      </svg>
      <div className="steam-trend-axis">
        <span>{trendDateFmt(slots[0].date)}</span>
        <span>{trendDateFmt(slots[midIndex].date)}</span>
        <span>{trendDateFmt(slots.at(-1)!.date)}</span>
      </div>
      <p className="steam-trend-readout">
        <span aria-hidden className="steam-trend-readout-dot" />
        <span>{readout}</span>
      </p>
    </div>
  );
}
