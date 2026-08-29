import { useState } from 'react';
import type { WeatherData } from '@nohm/shared';
import { motion } from 'motion/react';
import { deg, glyph, HUMIDITY_COLOR, PRECIP_COLOR, TEMP_COLOR, uvLevel, UV_COLOR, WIND_COLOR } from '../../lib/weather';

type Day = WeatherData['days'][number];
type BarStatKey = 'temperature' | 'precipitation' | 'uv' | 'wind' | 'humidity';

interface StatMeta {
  label: string;
  color: string;
  domainMax?: number;
  value: (day: Day) => number | undefined;
  format: (value: number) => string;
}

const BAR_STATS: Record<BarStatKey, StatMeta> = {
  temperature: {
    label: 'Temperature',
    color: TEMP_COLOR,
    value: (day) => day.maxTemperature,
    format: (value) => deg(value),
  },
  precipitation: {
    label: 'Rain',
    color: PRECIP_COLOR,
    value: (day) => day.precipitationMm,
    format: (value) => (value > 0 ? `${value} mm` : '—'),
  },
  uv: {
    label: 'UV',
    color: UV_COLOR,
    domainMax: 11,
    value: (day) => day.maxUvIndex,
    format: (value) => value.toFixed(1),
  },
  wind: {
    label: 'Wind',
    color: WIND_COLOR,
    value: (day) => day.maxWindSpeed,
    format: (value) => `${Math.round(value)} m/s`,
  },
  humidity: {
    label: 'Humidity',
    color: HUMIDITY_COLOR,
    domainMax: 100,
    value: (day) => day.humidity,
    format: (value) => `${Math.round(value)}%`,
  },
};

const STAT_TABS: { key: BarStatKey; label: string }[] = (Object.keys(BAR_STATS) as BarStatKey[]).map((key) => ({
  key,
  label: BAR_STATS[key].label,
}));

/** One bar per day for a single stat — every tab (including temperature) reads identically:
 * day, glyph, a bar growing from the left, and the day's value. */
function WeekStatBars({ days, stat }: Readonly<{ days: Day[]; stat: BarStatKey }>) {
  const meta = BAR_STATS[stat];
  const values = days.map(meta.value).filter((value): value is number => value != null);
  if (values.length === 0) return <p className="text-sm text-ink-faint">Not enough data for this stat yet.</p>;
  const max = Math.max(meta.domainMax ?? 0, ...values, 1);

  return (
    <div>
      {days.map((day, i) => {
        const value = meta.value(day);
        const barValue = value == null ? null : Math.max(value, 0);
        const isToday = i === 0;
        const barColor = stat === 'uv' && value != null ? uvLevel(value).color : meta.color;
        return (
          <motion.div
            key={day.date}
            className="grid grid-cols-[2.9rem_1.75rem_1fr_3.4rem] items-center gap-3 rounded-xl px-2 py-2.5 sm:grid-cols-[3.25rem_2rem_1fr_3.8rem]"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className={`text-sm ${isToday ? 'font-semibold' : 'text-ink-muted'}`}>{isToday ? 'Today' : day.dayLabel}</span>
            <span className="text-lg" aria-hidden>{glyph(day.symbol)}</span>
            <div className="relative h-1.5 rounded-full bg-track">
              {barValue != null && (
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: barColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max((barValue / max) * 100, barValue > 0 ? 3 : 0)}%` }}
                  transition={{ delay: 0.2 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
              )}
            </div>
            <span className="text-right text-sm tabular-nums text-ink-faint">{value != null ? meta.format(value) : '—'}</span>
          </motion.div>
        );
      })}
    </div>
  );
}

export function WeekAheadSection({ data }: Readonly<{ data: WeatherData }>) {
  const [stat, setStat] = useState<BarStatKey>('temperature');
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Week-ahead stat">
        {STAT_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={stat === tab.key}
            onClick={() => setStat(tab.key)}
            className={`weather-stat-tab ${stat === tab.key ? 'weather-stat-tab--active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {/* Rows keep the same key across stat switches (day.date, unaffected by `stat`), so only
          the bar width/value re-render — the day label and glyph never remount or re-animate. */}
      <WeekStatBars days={data.days} stat={stat} />
    </div>
  );
}
