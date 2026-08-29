import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { WeatherData } from '@nohm/shared';
import { motion } from 'motion/react';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { deg, glyph, HUMIDITY_COLOR, symbolLabel, uvLevel, weatherLocation, WIND_COLOR, windCompass } from '../../lib/weather';
import { useSkyNow } from '../../lib/skyTime';
import './weather.css';

/**
 * A small, deliberately soft approximation of daylight from the only solar data we
 * have. It starts and ends with a little warmth, then reaches its clearest point at
 * solar noon. That makes the overview's ambience feel connected to the real sky
 * without pretending to know cloud cover or the sun's exact altitude.
 */
export function daylightIntensity(sun: WeatherData['sun'], now: Date): number {
  if (!sun?.sunrise || !sun.sunset) return 0;

  const sunrise = Date.parse(sun.sunrise);
  const sunset = Date.parse(sun.sunset);
  const current = now.getTime();
  if (!Number.isFinite(sunrise) || !Number.isFinite(sunset) || sunset <= sunrise || current < sunrise || current > sunset) {
    return 0;
  }

  const progress = (current - sunrise) / (sunset - sunrise);
  return 0.16 + Math.sin(progress * Math.PI) * 0.84;
}

function MiniStat({ label, value, children }: Readonly<{ label: string; value: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[9px] uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      {children}
      <span className="text-[11px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Same needle-on-a-compass language as the detail page's wind tile, just small enough to sit
 * in a row of three — a glyph alone can't say "which way", the needle can. */
export function WindGauge({ speed, directionDeg }: Readonly<{ speed: number; directionDeg?: number }>) {
  const toward = directionDeg == null ? null : (directionDeg + 180) % 360;
  const direction = directionDeg == null ? '' : ` ${windCompass(directionDeg)}`;
  return (
    <MiniStat label="Wind" value={`${Math.round(speed)} m/s${direction}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <circle cx="16" cy="16" r="13" fill="none" stroke="var(--color-track)" strokeWidth="2" />
        {toward != null && (
          <g style={{ transform: `rotate(${toward}deg)`, transformOrigin: '16px 16px' }}>
            <path d="M16 5 l2.2 5.4h-4.4Z" fill={WIND_COLOR} />
            <line x1="16" y1="10" x2="16" y2="23" stroke={WIND_COLOR} strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
          </g>
        )}
        <circle cx="16" cy="16" r="1.6" fill="var(--color-ink-faint)" />
      </svg>
    </MiniStat>
  );
}

/** Circular counterpart to the detail page's humidity bar — a ring reads faster at this size than a bar. */
export function HumidityGauge({ humidity }: Readonly<{ humidity: number }>) {
  const r = 12;
  const circumference = 2 * Math.PI * r;
  return (
    <MiniStat label="Humidity" value={`${Math.round(humidity)}%`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 -rotate-90" aria-hidden>
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--color-track)" strokeWidth="3" />
        <circle
          cx="16" cy="16" r={r} fill="none" stroke={HUMIDITY_COLOR} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={circumference * (1 - humidity / 100)}
        />
      </svg>
    </MiniStat>
  );
}

/** Small version of the detail page's UV arc, colored from the same WHO band as its `uvLevel()` label. */
export function UvGauge({ uvIndex }: Readonly<{ uvIndex: number }>) {
  const level = uvLevel(uvIndex);
  const fraction = Math.min(uvIndex / 11, 1);
  const r = 12;
  const arc = Math.PI * r;
  return (
    <MiniStat label="UV" value={`${uvIndex.toFixed(1)} ${level.label}`}>
      <svg viewBox="0 0 32 20" className="h-6 w-8" aria-hidden>
        <path d={`M 3 18 A ${r} ${r} 0 0 1 29 18`} fill="none" stroke="var(--color-track)" strokeWidth="3" strokeLinecap="round" />
        <path
          d={`M 3 18 A ${r} ${r} 0 0 1 29 18`} fill="none" stroke={level.color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={arc} strokeDashoffset={arc * (1 - fraction)}
        />
      </svg>
    </MiniStat>
  );
}

function MiniConditions({ data }: Readonly<{ data: WeatherData }>) {
  return (
    <div className="mt-4 flex items-start gap-5">
      <WindGauge speed={data.current.windSpeed} directionDeg={data.current.windDirectionDeg} />
      {data.current.humidity != null && <HumidityGauge humidity={data.current.humidity} />}
      {data.current.uvIndex != null && <UvGauge uvIndex={data.current.uvIndex} />}
    </div>
  );
}

const RAIN_COLOR = 'light-dark(#0d7fc4, #5ec2ff)';

/** Small always-on temperature sparkline for the next hours; endpoint-labeled, details live on the section page.
 * Precipitation gets its own baseline band rather than a second y-scale on the temperature plot — different
 * physical quantities on one axis would invent a correlation that isn't there. Bar height carries magnitude
 * (mm that hour); the run of contiguous bars carries duration, and the summary line under the axis spells
 * both out directly so nothing is hover-only. */
function HourSparkline({ hours }: Readonly<{ hours: WeatherData['hours'] }>) {
  const gradientId = `${useId().replaceAll(':', '')}-spark`;
  const [active, setActive] = useState<{ index: number; zone: 'temp' | 'rain' } | null>(null);
  if (hours.length < 2) return null;
  const W = 100;
  const H = 46;
  const RAIN_BAND = 9;
  const RAIN_GAP = 3;
  const TEMP_H = H - RAIN_BAND - RAIN_GAP;
  const temps = hours.map((h) => h.temperature);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = Math.max(max - min, 2);
  const xAt = (i: number) => (i / (hours.length - 1)) * W;
  const yAt = (t: number) => 5 + (TEMP_H - 10) * (1 - (t - min) / span);
  const line = temps.map((t, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(t)}`).join(' ');
  const peakIndex = temps.indexOf(max);

  const rainHours = hours.filter((h) => h.precipitationMm > 0);
  const precipMax = Math.max(...hours.map((h) => h.precipitationMm), 0.1);
  const totalPrecip = rainHours.reduce((sum, h) => sum + h.precipitationMm, 0);
  const rainRange = (() => {
    if (rainHours.length > 1) return `${rainHours[0].hourLabel}–${rainHours.at(-1)!.hourLabel}:00`;
    if (rainHours.length === 1) return `${rainHours[0].hourLabel}:00`;
    return null;
  })();

  // Temp and rain are separate hover zones (split at the gap between the two bands) so
  // hovering the temperature line for a rainy hour doesn't also surface the rain readout —
  // rain only shows up when you're actually pointing at the rain band.
  const zoneBoundary = TEMP_H + RAIN_GAP / 2;
  const readNearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const i = Math.min(
      hours.length - 1,
      Math.max(0, Math.round(((event.clientX - rect.left) / rect.width) * (hours.length - 1))),
    );
    const ySvg = ((event.clientY - rect.top) / rect.height) * H;
    if (ySvg <= zoneBoundary) {
      setActive({ index: i, zone: 'temp' });
    } else {
      setActive(hours[i].precipitationMm > 0 ? { index: i, zone: 'rain' } : null);
    }
  };
  const activeTempHour = active?.zone === 'temp' ? hours[active.index] : null;
  const activeRainHour = active?.zone === 'rain' ? hours[active.index] : null;
  const readout = (() => {
    if (activeTempHour) return `${deg(activeTempHour.temperature)} · ${activeTempHour.hourLabel}:00`;
    if (activeRainHour) return `${activeRainHour.precipitationMm.toFixed(1)}mm rain · ${activeRainHour.hourLabel}:00`;
    if (rainRange) return `rain ${rainRange} · ${totalPrecip.toFixed(1)}mm`;
    return null;
  })();
  const readoutColor = activeTempHour ? 'var(--color-accent-weather)' : RAIN_COLOR;

  return (
    <div className="flex h-full min-w-0 flex-col justify-center">
      <div className="mb-2 flex items-baseline justify-between text-xs text-ink-faint">
        <span className="uppercase tracking-[0.12em]">Next {hours.length} hours</span>
        <span className="tabular-nums">peak {deg(max)} · {hours[peakIndex].hourLabel}:00</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full touch-none"
        aria-label="Temperature and rain over the next hours"
        onPointerMove={readNearest}
        onPointerDown={readNearest}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') setActive(null);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--color-accent-weather)" stopOpacity="0.22" />
            <stop offset="1" stopColor="var(--color-accent-weather)" stopOpacity="0" />
          </linearGradient>
          {/* Left-to-right reveal. Animating pathLength instead breaks into dashes when
              combined with non-scaling-stroke, since dashes are measured in screen space. */}
          <clipPath id={`${gradientId}-reveal`}>
            <motion.rect
              x="0"
              y="0"
              height={H}
              initial={{ width: 0 }}
              animate={{ width: W }}
              transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
            />
          </clipPath>
        </defs>
        <g clipPath={`url(#${gradientId}-reveal)`}>
          <path d={`${line} L${W},${TEMP_H} L0,${TEMP_H} Z`} fill={`url(#${gradientId})`} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent-weather)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M${xAt(hours.length - 1)},${yAt(temps.at(-1)!)} l0.01,0`}
            stroke="var(--color-accent-weather)"
            strokeWidth={5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* Precipitation band: its own baseline scale, not the temperature axis — bar
              height is magnitude (mm that hour), the run of bars is duration. */}
          {rainHours.length > 0 &&
            hours.map((hour, i) => {
              if (hour.precipitationMm <= 0) return null;
              const barW = Math.min(3, (W / hours.length) * 0.55);
              const barH = Math.max((hour.precipitationMm / precipMax) * RAIN_BAND, 1.5);
              return (
                <rect
                  key={hour.time}
                  x={xAt(i) - barW / 2}
                  y={H - barH}
                  width={barW}
                  height={barH}
                  rx={0.6}
                  fill={RAIN_COLOR}
                  opacity={active?.zone === 'rain' && active.index === i ? 1 : 0.75}
                  aria-label={`${hour.hourLabel}:00: ${hour.precipitationMm.toFixed(1)}mm rain`}
                />
              );
            })}
          {active != null && (
            <line
              x1={xAt(active.index)}
              y1={0}
              x2={xAt(active.index)}
              y2={H}
              stroke="var(--color-card-border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {activeTempHour && (
            <>
              <path
                d={`M${xAt(active!.index)},${yAt(activeTempHour.temperature)} l0.01,0`}
                stroke="var(--color-canvas)"
                strokeWidth={7}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={`M${xAt(active!.index)},${yAt(activeTempHour.temperature)} l0.01,0`}
                stroke="var(--color-accent-weather)"
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </g>
      </svg>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-ink-faint">
        <span>{hours[0].hourLabel}:00</span>
        <span>{hours[Math.floor((hours.length - 1) / 2)].hourLabel}:00</span>
        <span>{hours.at(-1)!.hourLabel}:00</span>
      </div>
      {readout && (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] tabular-nums text-ink-faint">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: readoutColor }} />
          {readout}
        </p>
      )}
    </div>
  );
}

/** Next few days at a glance — forward-looking counterpart to the hourly sparkline, which
 * only covers today. Sun/moon detail lives on the full weather page, not repeated here. */
function WeekAheadMini({ days }: Readonly<{ days: WeatherData['days'] }>) {
  const upcoming = days.slice(1, 5);
  if (upcoming.length === 0) return null;
  return (
    <div className="flex h-full items-center justify-between gap-2">
      {upcoming.map((day) => (
        <div key={day.date} className="flex min-w-0 flex-col items-center gap-2.5">
          <span className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">{day.dayLabel}</span>
          <span className="text-3xl" aria-hidden>{glyph(day.symbol)}</span>
          <span className="text-sm tabular-nums">
            <strong>{deg(day.maxTemperature)}</strong> <span className="text-ink-faint">{deg(day.minTemperature)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function WeatherOverview() {
  const { envelope, offline } = useWidget<WeatherData>('weather');
  const now = useSkyNow();
  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => {
        const today = data.days[0];
        // Ten brightness steps are enough to keep CSS compact, while still avoiding
        // a visibly abrupt shift as the shared clock advances through the day.
        const sunlight = Math.round(daylightIntensity(data.sun, now) * 10);
        return (
          <div className="weather-overview grid gap-x-6 gap-y-4 lg:grid-cols-[minmax(12rem,0.9fr)_minmax(0,1.2fr)_minmax(13rem,0.9fr)]" data-sunlight={sunlight}>
            <div>
              <div className="flex items-center gap-3">
                <span className="text-4xl" aria-hidden>{glyph(data.current.symbol)}</span>
                <div>
                  <p className="text-4xl font-semibold tracking-[-0.05em]">{deg(data.current.temperature)}</p>
                  <p className="text-xs text-ink-muted">
                    {symbolLabel(data.current.symbol)}
                    {today && <span className="text-ink-faint"> · {deg(today.minTemperature)}–{deg(today.maxTemperature)}</span>}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-ink-faint">{weatherLocation(data.location)}</p>
                </div>
              </div>
              <MiniConditions data={data} />
            </div>
            <HourSparkline hours={data.hours.slice(0, 12)} />
            <WeekAheadMini days={data.days} />
          </div>
        );
      }}
    </WidgetBody>
  );
}
