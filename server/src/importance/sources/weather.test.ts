import { describe, expect, it } from 'vitest';
import type { WeatherData } from '@nohm/shared';
import { weatherCandidates } from './weather.js';

describe('weatherCandidates', () => {
  const weather: WeatherData = {
    location: { lat: 59.9, lon: 10.7, name: 'Oslo' }, current: { temperature: 12, windSpeed: 4, symbol: 'cloudy' }, hours: [],
    days: [
      { date: '2026-07-16', dayLabel: 'Thu', minTemperature: 10, maxTemperature: 18, precipitationMm: 0, symbol: 'cloudy' },
      { date: '2026-07-17', dayLabel: 'Fri', minTemperature: 11, maxTemperature: 19, precipitationMm: 1, symbol: 'partlycloudy_day' },
    ],
  };

  it('uses today rather than the following date for an overnight fallback forecast', () => {
    const [candidate] = weatherCandidates(weather, 25, -10, 12, 8, new Date('2026-07-16T01:00:00').getTime());

    expect(candidate).toMatchObject({ id: 'weather:later-today:2026-07-16', kicker: 'Later today', title: '10° to 18°' });
  });

  it('surfaces a hero-eligible severe candidate when thunder is in the next 3 hours', () => {
    const now = new Date('2026-07-16T12:00:00Z').getTime();
    const data: WeatherData = {
      ...weather,
      hours: [{ time: '2026-07-16T13:00:00Z', hourLabel: '13', temperature: 16, precipitationMm: 3, symbol: 'thunder' }],
    };

    const candidates = weatherCandidates(data, 25, -10, 12, 8, now);

    expect(candidates).toContainEqual(expect.objectContaining({ id: 'weather:severe', shapes: ['hero', 'secondary', 'tile'] }));
  });

  it('does not surface rain-soon when it is already wet right now', () => {
    const data: WeatherData = {
      ...weather,
      current: { ...weather.current, precipitationMm: 2 },
      hours: [{ time: '2026-07-16T13:00:00Z', hourLabel: '13', temperature: 16, precipitationMm: 2, symbol: 'rain' }],
    };

    expect(weatherCandidates(data, 25, -10, 12, 8).map((c) => c.id)).not.toContain('weather:rain-soon');
  });

  it('surfaces rain-soon when currently dry but rain is expected within 6 hours', () => {
    const data: WeatherData = {
      ...weather,
      hours: [{ time: '2026-07-16T13:00:00Z', hourLabel: '13', temperature: 16, precipitationMm: 0.5, symbol: 'rain' }],
    };

    expect(weatherCandidates(data, 25, -10, 12, 8)).toContainEqual(expect.objectContaining({ id: 'weather:rain-soon', title: 'Rain by 13:00' }));
  });

  it('surfaces a windy-today candidate once the peak crosses the configured threshold', () => {
    const data: WeatherData = { ...weather, days: [{ ...weather.days[0]!, maxWindSpeed: 14 }, weather.days[1]!] };

    expect(weatherCandidates(data, 25, -10, 12, 8)).toContainEqual(expect.objectContaining({ id: 'weather:wind', title: '14 m/s peak' }));
  });

  it('surfaces a high-UV candidate once the peak crosses the configured threshold', () => {
    const data: WeatherData = { ...weather, days: [{ ...weather.days[0]!, maxUvIndex: 9 }, weather.days[1]!] };

    expect(weatherCandidates(data, 25, -10, 12, 8)).toContainEqual(expect.objectContaining({ id: 'weather:uv', title: 'UV 9.0 today' }));
  });

  it('surfaces a full-moon candidate when the phase is within tolerance of 180°', () => {
    const data: WeatherData = { ...weather, moon: { phaseDeg: 178, moonrise: null, moonset: null } };

    expect(weatherCandidates(data, 25, -10, 12, 8)).toContainEqual(expect.objectContaining({ id: 'weather:moon', title: 'Full moon tonight' }));
  });

  it('surfaces a sunset-soon candidate within 45 minutes of sunset', () => {
    const now = new Date('2026-07-16T20:00:00Z').getTime();
    const data: WeatherData = { ...weather, sun: { sunrise: null, sunset: '2026-07-16T20:30:00Z' } };

    expect(weatherCandidates(data, 25, -10, 12, 8, now)).toContainEqual(expect.objectContaining({ id: 'weather:sunset', detail: 'Sets in 30 min' }));
  });
});
