import type { ReactNode } from 'react';
import type { CommandCenterSlot, WeatherData } from '@nohm/shared';
import { UvGauge, WindGauge } from '../../../sections/weather/WeatherOverview';
import { deg, glyph } from '../../../lib/weather';

export function WeatherHourlyRows({ weather }: Readonly<{ weather: WeatherData }>): ReactNode {
  if (!weather.hours.length) return null;
  return <div className="command-hours mt-3" aria-label="Hourly forecast">
    {weather.hours.slice(0, 6).map((hour) => <div key={hour.time} className="command-hour">
      <span>{hour.hourLabel}</span>
      <span aria-hidden className="text-base leading-none">{glyph(hour.symbol)}</span>
      <strong>{deg(hour.temperature)}</strong>
    </div>)}
  </div>;
}

/** Shared by every "here's the next few hours" kind (severe/hot/cold/rain) — only the
 * server-supplied title/detail differ between them. */
function WeatherHourlyStrip({ title, detail, weather }: Readonly<{ title: string; detail: string; weather: WeatherData }>): ReactNode {
  if (!weather.hours.length) return null;
  return <>
    <p className="mt-4 text-sm font-semibold text-ink">{title}</p>
    <WeatherHourlyRows weather={weather} />
    <p className="mt-2 text-[11px] text-ink-faint">{detail}</p>
  </>;
}

export function WeatherSignalSecondary({ slot, weather }: Readonly<{ slot: CommandCenterSlot; weather: WeatherData | undefined }>): ReactNode {
  if (slot.render.type !== 'weather-signal' || !weather) return null;
  const { kind } = slot.render;
  if (kind === 'wind') {
    return <div className="command-secondary-ai mt-4">
      <WindGauge speed={weather.current.windSpeed} directionDeg={weather.current.windDirectionDeg} />
      <div className="min-w-0"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div>
    </div>;
  }
  if (kind === 'uv' && weather.current.uvIndex != null) {
    return <div className="command-secondary-ai mt-4">
      <UvGauge uvIndex={weather.current.uvIndex} />
      <div className="min-w-0"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div>
    </div>;
  }
  return <WeatherHourlyStrip title={slot.title} detail={slot.detail} weather={weather} />;
}
