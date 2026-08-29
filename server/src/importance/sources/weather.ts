import type { WeatherData } from '@nohm/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

// forecast.dayLabel is abbreviated for the widget's narrow column; card copy reads better with the full name.
const weekdayFullFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' });

/**
 * A fixed comfortable-range threshold, not a rolling personal baseline — WeatherData only carries
 * a forecast, no history to compare against, so "extreme" here just means "past a configured
 * line" rather than "unusual for you".
 */
const SEVERE_HORIZON_MS = 3 * 60 * 60_000;
const SEVERE_SYMBOLS: readonly [prefix: string, label: string][] = [
  ['thunder', 'Thunderstorms expected'],
  ['heavyrain', 'Heavy rain expected'],
  ['heavysnow', 'Heavy snow expected'],
  ['heavysleet', 'Heavy sleet expected'],
];

/** Same "strip the day/night/twilight suffix" convention as the client's `glyph()`. */
function baseSymbol(symbol: string): string {
  return symbol.replace(/_(day|night|polartwilight)$/, '');
}

function severeLabel(symbol: string): string | undefined {
  return SEVERE_SYMBOLS.find(([prefix]) => baseSymbol(symbol).startsWith(prefix))?.[1];
}

function severeCandidate(data: WeatherData, now: number): Candidate | undefined {
  const upcoming = data.hours.filter((hour) => {
    const delta = Date.parse(hour.time) - now;
    return delta >= -60_000 && delta <= SEVERE_HORIZON_MS;
  });
  const hit = upcoming
    .map((hour) => ({ hour, label: severeLabel(hour.symbol) }))
    .find((entry): entry is { hour: WeatherData['hours'][number]; label: string } => entry.label !== undefined);
  if (!hit) return undefined;
  const isNow = Date.parse(hit.hour.time) - now < 60 * 60_000;
  return {
    id: 'weather:severe', source: 'weather', kind: 'weather', score: 90, shapes: [...allShapes],
    kicker: 'Severe weather', title: hit.label,
    detail: isNow ? 'Happening now — check before heading out' : `Arriving around ${hit.hour.hourLabel}:00`,
    href: '#/weather', render: { type: 'weather-signal', kind: 'severe' },
  };
}

function hotCandidate(today: WeatherData['days'][number], hotThresholdC: number): Candidate | undefined {
  if (today.maxTemperature < hotThresholdC) return undefined;
  return {
    id: 'weather:hot', source: 'weather', kind: 'weather', score: 62, shapes: ['secondary', 'tile'],
    kicker: 'Heat today', title: `${Math.round(today.maxTemperature)}° expected`,
    detail: 'Above your configured comfortable range', href: '#/weather', render: { type: 'weather-signal', kind: 'hot' },
  };
}

function coldCandidate(today: WeatherData['days'][number], coldThresholdC: number): Candidate | undefined {
  if (today.minTemperature > coldThresholdC) return undefined;
  return {
    id: 'weather:cold', source: 'weather', kind: 'weather', score: 62, shapes: ['secondary', 'tile'],
    kicker: 'Cold today', title: `${Math.round(today.minTemperature)}° expected`,
    detail: 'Below your configured comfortable range', href: '#/weather', render: { type: 'weather-signal', kind: 'cold' },
  };
}

/** Only fires when it isn't already obviously wet — a genuinely upcoming change, not the current forecast. */
function rainSoonCandidate(data: WeatherData): Candidate | undefined {
  if ((data.current.precipitationMm ?? 0) > 0.1) return undefined;
  const hit = data.hours.slice(0, 6).find((hour) => hour.precipitationMm >= 0.2);
  if (!hit) return undefined;
  return {
    id: 'weather:rain-soon', source: 'weather', kind: 'weather', score: 58, shapes: ['secondary', 'tile'],
    kicker: 'Rain ahead', title: `Rain by ${hit.hourLabel}:00`,
    detail: `${hit.precipitationMm.toFixed(1)} mm expected`, href: '#/weather', render: { type: 'weather-signal', kind: 'rain' },
  };
}

function windCandidate(today: WeatherData['days'][number], windThresholdMs: number): Candidate | undefined {
  if (today.maxWindSpeed === undefined || today.maxWindSpeed < windThresholdMs) return undefined;
  return {
    id: 'weather:wind', source: 'weather', kind: 'weather', score: 50, shapes: ['secondary', 'tile'],
    kicker: 'Windy today', title: `${Math.round(today.maxWindSpeed)} m/s peak`,
    detail: 'Above your configured wind threshold', href: '#/weather', render: { type: 'weather-signal', kind: 'wind' },
  };
}

function uvCandidate(today: WeatherData['days'][number], uvThresholdHigh: number): Candidate | undefined {
  if (today.maxUvIndex === undefined || today.maxUvIndex < uvThresholdHigh) return undefined;
  return {
    id: 'weather:uv', source: 'weather', kind: 'weather', score: 46, shapes: ['secondary', 'tile'],
    kicker: 'High UV', title: `UV ${today.maxUvIndex.toFixed(1)} today`,
    detail: 'Sun protection recommended', href: '#/weather', render: { type: 'weather-signal', kind: 'uv' },
  };
}

const SUNSET_WINDOW_MS = 45 * 60_000;

function sunsetCandidate(sun: WeatherData['sun'], now: number): Candidate | undefined {
  if (!sun?.sunset) return undefined;
  const minsToSunset = (Date.parse(sun.sunset) - now) / 60_000;
  if (minsToSunset < 0 || minsToSunset > SUNSET_WINDOW_MS / 60_000) return undefined;
  return {
    id: 'weather:sunset', source: 'weather', kind: 'weather', score: 30, shapes: ['tile'],
    kicker: 'Golden hour', title: 'Sunset soon',
    detail: `Sets in ${Math.round(minsToSunset)} min`, href: '#/weather', render: { type: 'weather-signal', kind: 'sunset' },
  };
}

const MOON_PHASE_TOLERANCE_DEG = 5;

function circularDistanceDeg(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

function moonCandidate(moon: WeatherData['moon']): Candidate | undefined {
  if (!moon) return undefined;
  const isNew = circularDistanceDeg(moon.phaseDeg, 0) <= MOON_PHASE_TOLERANCE_DEG;
  const isFull = circularDistanceDeg(moon.phaseDeg, 180) <= MOON_PHASE_TOLERANCE_DEG;
  if (!isNew && !isFull) return undefined;
  const illumination = Math.round(((1 - Math.cos((moon.phaseDeg * Math.PI) / 180)) / 2) * 100);
  return {
    id: 'weather:moon', source: 'weather', kind: 'weather', score: 28, shapes: ['tile'],
    kicker: "Tonight's sky", title: isFull ? 'Full moon tonight' : 'New moon tonight',
    detail: `${illumination}% lit`, href: '#/weather', render: { type: 'weather-signal', kind: 'moon' },
  };
}

function forecastCandidate(data: WeatherData, today: WeatherData['days'][number], now: number): Candidate | undefined {
  const overnight = new Date(now).getHours() < 6;
  const forecast = overnight ? today : data.days[1];
  if (!forecast) return undefined;
  const forecastDate = new Date(`${forecast.date}T12:00:00Z`);
  const precipitationDetail = `${forecast.precipitationMm.toFixed(1)} mm precipitation expected`;
  const dryDetail = `${weekdayFullFmt.format(forecastDate)} looks dry`;
  return {
    id: `weather:${overnight ? 'later-today' : 'tomorrow'}:${forecast.date}`, source: 'weather', kind: 'weather', score: 26, shapes: ['tile'],
    kicker: overnight ? 'Later today' : "Tomorrow's forecast", title: `${Math.round(forecast.minTemperature)}° to ${Math.round(forecast.maxTemperature)}°`,
    detail: forecast.precipitationMm > 0 ? precipitationDetail : dryDetail,
    href: '#/weather', render: { type: 'text' },
  };
}

export function weatherCandidates(
  data: WeatherData | undefined,
  hotThresholdC: number,
  coldThresholdC: number,
  windThresholdMs: number,
  uvThresholdHigh: number,
  now = Date.now(),
): Candidate[] {
  const today = data?.days[0];
  if (!data || !today) return [];
  return [
    severeCandidate(data, now),
    hotCandidate(today, hotThresholdC),
    coldCandidate(today, coldThresholdC),
    rainSoonCandidate(data),
    windCandidate(today, windThresholdMs),
    uvCandidate(today, uvThresholdHigh),
    sunsetCandidate(data.sun, now),
    moonCandidate(data.moon),
    forecastCandidate(data, today, now),
  ].filter((candidate): candidate is Candidate => candidate !== undefined);
}
