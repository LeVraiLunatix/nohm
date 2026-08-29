import type { WeatherData } from '@nohm/shared';
import { dateDaysAgo, daysFromNowAt } from '@nohm/shared';

// ── Weather ──────────────────────────────────────────────────────────────────────────────────

export function weather(now: Date): WeatherData {
  const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000);
  const weekday = (offset: number) => day(offset).toLocaleDateString('en-GB', { weekday: 'short' });
  const sunrise = daysFromNowAt(now, 0, 5, 42);
  const sunset = daysFromNowAt(now, 0, 21, 8);

  // Each hour's condition, independent of what real clock hour it happens to land on — the
  // hourLabel and day/night symbol suffix below are derived from the real timestamp instead of
  // hardcoded, so the sky-preview slider (which scrubs by real time, not by this label) never
  // shows a label that disagrees with whether the sun is actually supposed to be up then.
  const hourConditions: { base: string; precipitationMm: number; uvIndex: number; windSpeed: number; humidity: number; tempDelta: number }[] = [
    { base: 'partlycloudy', precipitationMm: 0, uvIndex: 4.2, windSpeed: 2.4, humidity: 57, tempDelta: 0 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 4.6, windSpeed: 2.6, humidity: 55, tempDelta: 1 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 3.8, windSpeed: 2.9, humidity: 55, tempDelta: 1 },
    { base: 'fair', precipitationMm: 0.1, uvIndex: 2.4, windSpeed: 3.1, humidity: 60, tempDelta: -1 },
    { base: 'lightrain', precipitationMm: 0.3, uvIndex: 1.5, windSpeed: 3.4, humidity: 64, tempDelta: -2 },
    { base: 'rain', precipitationMm: 0.8, uvIndex: 0.7, windSpeed: 3.8, humidity: 70, tempDelta: -3 },
    { base: 'lightrain', precipitationMm: 0.4, uvIndex: 0.2, windSpeed: 3.2, humidity: 72, tempDelta: -4 },
    { base: 'partlycloudy', precipitationMm: 0, uvIndex: 0, windSpeed: 2.4, humidity: 71, tempDelta: -4 },
    { base: 'fair', precipitationMm: 0, uvIndex: 0, windSpeed: 2.0, humidity: 73, tempDelta: -5 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 0, windSpeed: 1.8, humidity: 75, tempDelta: -5 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 0, windSpeed: 1.6, humidity: 76, tempDelta: -6 },
    { base: 'clearsky', precipitationMm: 0, uvIndex: 0, windSpeed: 1.5, humidity: 77, tempDelta: -6 },
  ];
  // Spans today's remaining hours plus a few days out, hourly near-term then 6-hourly further
  // out — mirrors what MET actually reports — so the day switcher has something to switch to.
  const HOUR_SPANS: { hoursFromNow: number; stepHours: number; count: number; baseTemp: number }[] = [
    { hoursFromNow: 1, stepHours: 1, count: 12, baseTemp: 18 },
    { hoursFromNow: 13, stepHours: 1, count: 24, baseTemp: 20 },
    { hoursFromNow: 37, stepHours: 6, count: 4, baseTemp: 17 },
    { hoursFromNow: 61, stepHours: 6, count: 4, baseTemp: 19 },
  ];
  const hours = HOUR_SPANS.flatMap((span, spanIndex) =>
    Array.from({ length: span.count }, (_unused, i) => {
      const at = new Date(now.getTime() + (span.hoursFromNow + i * span.stepHours) * 3_600_000);
      const condition = hourConditions[(spanIndex * 7 + i) % hourConditions.length];
      const isDay = at.getHours() >= 6 && at.getHours() < 21;
      return {
        time: at.toISOString(),
        date: at.toISOString().slice(0, 10),
        hourLabel: String(at.getHours()).padStart(2, '0'),
        temperature: span.baseTemp + condition.tempDelta,
        precipitationMm: condition.precipitationMm,
        uvIndex: isDay ? condition.uvIndex : 0,
        windSpeed: condition.windSpeed,
        humidity: condition.humidity,
        symbol: `${condition.base}_${isDay ? 'day' : 'night'}`,
      };
    }),
  );
  return {
    location: { lat: 59.91, lon: 10.75, name: 'Oslo' },
    current: {
      temperature: 18, windSpeed: 2.6, windDirectionDeg: 224, humidity: 58, uvIndex: 4.2,
      precipitationMm: 0, symbol: 'partlycloudy_day',
    },
    hours,
    days: [
      { date: dateDaysAgo(now, 0), dayLabel: weekday(0), minTemperature: 14, maxTemperature: 20, precipitationMm: 0.4, maxUvIndex: 4.6, maxWindSpeed: 3.8, humidity: 58, symbol: 'partlycloudy_day' },
      { date: dateDaysAgo(now, -1), dayLabel: weekday(1), minTemperature: 13, maxTemperature: 22, precipitationMm: 0, maxUvIndex: 5.1, maxWindSpeed: 2.9, humidity: 52, symbol: 'clearsky_day' },
      { date: dateDaysAgo(now, -2), dayLabel: weekday(2), minTemperature: 15, maxTemperature: 24, precipitationMm: 0, maxUvIndex: 5.4, maxWindSpeed: 3.1, humidity: 49, symbol: 'clearsky_day' },
      { date: dateDaysAgo(now, -3), dayLabel: weekday(3), minTemperature: 16, maxTemperature: 21, precipitationMm: 2.8, maxUvIndex: 3.2, maxWindSpeed: 5.6, humidity: 68, symbol: 'rainshowers_day' },
      { date: dateDaysAgo(now, -4), dayLabel: weekday(4), minTemperature: 13, maxTemperature: 17, precipitationMm: 6.1, maxUvIndex: 1.8, maxWindSpeed: 6.9, humidity: 78, symbol: 'rain' },
      { date: dateDaysAgo(now, -5), dayLabel: weekday(5), minTemperature: 12, maxTemperature: 18, precipitationMm: 1.2, maxUvIndex: 3.9, maxWindSpeed: 4.2, humidity: 63, symbol: 'partlycloudy_day' },
      { date: dateDaysAgo(now, -6), dayLabel: weekday(6), minTemperature: 14, maxTemperature: 20, precipitationMm: 0, maxUvIndex: 4.8, maxWindSpeed: 2.7, humidity: 55, symbol: 'fair_day' },
    ],
    sun: { sunrise: sunrise.toISOString(), sunset: sunset.toISOString() },
    moon: { phaseDeg: 132, moonrise: daysFromNowAt(now, 0, 16, 24).toISOString(), moonset: daysFromNowAt(now, 0, 2, 51).toISOString() },
  };
}

