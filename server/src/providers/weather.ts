import { z } from 'zod';
import { weatherSchema, type WeatherData } from '@nohm/shared';
import type { Provider } from '../scheduler.js';

// Identify ourselves as api.met.no's terms require.
const USER_AGENT = 'nohm/0.1 (+github.com/JoachimVN/Personal-Dashboard)';
const GEOCODER_URL = 'https://nominatim.openstreetmap.org/reverse';

// Minimal view of the Locationforecast 2.0 "complete" response.
const metSchema = z.object({
  properties: z.object({
    timeseries: z.array(
      z.object({
        time: z.string(),
        data: z.object({
          instant: z.object({
            details: z.object({
              air_temperature: z.number(),
              wind_speed: z.number().optional(),
              wind_from_direction: z.number().optional(),
              relative_humidity: z.number().optional(),
              ultraviolet_index_clear_sky: z.number().optional(),
            }),
          }),
          next_1_hours: z
            .object({
              summary: z.object({ symbol_code: z.string() }),
              details: z.object({ precipitation_amount: z.number().optional() }).optional(),
            })
            .optional(),
          next_6_hours: z
            .object({
              summary: z.object({ symbol_code: z.string() }),
              details: z.object({ precipitation_amount: z.number().optional() }).optional(),
            })
            .optional(),
          next_12_hours: z
            .object({ summary: z.object({ symbol_code: z.string() }) })
            .optional(),
        }),
      }),
    ),
  }),
});

type MetEntry = z.infer<typeof metSchema>['properties']['timeseries'][number];

const reverseGeocodeSchema = z.object({
  address: z.record(z.string(), z.string()).optional(),
  display_name: z.string().optional(),
});

// MET sunrise 3.0: sun/moon event times are null on days without one (polar day/night).
const sunEvent = z.object({ time: z.string().nullable().optional() }).nullable().optional();
const sunriseSunSchema = z.object({
  properties: z.object({ sunrise: sunEvent, sunset: sunEvent }),
});
const sunriseMoonSchema = z.object({
  properties: z.object({ moonrise: sunEvent, moonset: sunEvent, moonphase: z.number() }),
});

type SunData = NonNullable<WeatherData['sun']>;
type MoonData = NonNullable<WeatherData['moon']>;

/** "+02:00"-style offset the sunrise API expects, derived from the dashboard timezone. */
function utcOffsetLabel(timezone: string, at: Date): string {
  const name = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = name?.match(/GMT([+-]\d{2}:\d{2})/);
  return match ? match[1] : '+00:00';
}

async function fetchAstro(
  coords: { lat: number; lon: number },
  date: string,
  offset: string,
  signal: AbortSignal,
): Promise<{ sun?: SunData; moon?: MoonData }> {
  const query =
    `?lat=${coords.lat.toFixed(4)}&lon=${coords.lon.toFixed(4)}` +
    `&date=${date}&offset=${encodeURIComponent(offset)}`;
  const request = (body: 'sun' | 'moon') =>
    fetch(`https://api.met.no/weatherapi/sunrise/3.0/${body}${query}`, {
      signal,
      headers: { 'User-Agent': USER_AGENT },
    });

  // Astro data is decoration on the forecast; either body failing just omits that block.
  const [sun, moon] = await Promise.all([
    request('sun')
      .then(async (res): Promise<SunData | undefined> => {
        if (!res.ok) return undefined;
        const { properties } = sunriseSunSchema.parse(await res.json());
        return {
          sunrise: properties.sunrise?.time ?? null,
          sunset: properties.sunset?.time ?? null,
        };
      })
      .catch(() => undefined),
    request('moon')
      .then(async (res): Promise<MoonData | undefined> => {
        if (!res.ok) return undefined;
        const { properties } = sunriseMoonSchema.parse(await res.json());
        return {
          phaseDeg: properties.moonphase,
          moonrise: properties.moonrise?.time ?? null,
          moonset: properties.moonset?.time ?? null,
        };
      })
      .catch(() => undefined),
  ]);
  return { sun, moon };
}

function coordinateLabel(coords: { lat: number; lon: number }): string {
  const latitude = `${Math.abs(coords.lat).toFixed(2)}° ${coords.lat >= 0 ? 'N' : 'S'}`;
  const longitude = `${Math.abs(coords.lon).toFixed(2)}° ${coords.lon >= 0 ? 'E' : 'W'}`;
  return `${latitude} · ${longitude}`;
}

async function reverseGeocode(coords: { lat: number; lon: number }, signal: AbortSignal): Promise<string> {
  const url = new URL(GEOCODER_URL);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '10');
  url.searchParams.set('lat', coords.lat.toFixed(4));
  url.searchParams.set('lon', coords.lon.toFixed(4));
  try {
    const response = await fetch(url, { signal, headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) return coordinateLabel(coords);
    const result = reverseGeocodeSchema.parse(await response.json());
    const address = result.address ?? {};
    return address.city
      ?? address.town
      ?? address.village
      ?? address.municipality
      ?? address.suburb
      ?? address.neighbourhood
      ?? result.display_name?.split(',')[0]
      ?? coordinateLabel(coords);
  } catch {
    return coordinateLabel(coords);
  }
}

function symbolOf(entry: MetEntry): string {
  return (
    entry.data.next_1_hours?.summary.symbol_code ??
    entry.data.next_6_hours?.summary.symbol_code ??
    entry.data.next_12_hours?.summary.symbol_code ??
    'cloudy'
  );
}

function closestToMidday(entries: MetEntry[], hourFmt: Intl.DateTimeFormat): MetEntry {
  const [first, ...rest] = entries;
  return rest.reduce((best, entry) => {
    const bestDistance = Math.abs(Number(hourFmt.format(new Date(best.time))) - 12);
    const entryDistance = Math.abs(Number(hourFmt.format(new Date(entry.time))) - 12);
    return entryDistance < bestDistance ? entry : best;
  }, first);
}

export interface WeatherProvider extends Provider<WeatherData> {
  /** Overrides the env-configured location, e.g. with the client's device geolocation. */
  setCoords(next: { lat: number; lon: number }): void;
}

export function createWeatherProvider(
  fallbackCoords: { lat: number; lon: number } | undefined,
  timezone: string,
): WeatherProvider {
  let coords = fallbackCoords;
  let locationCache: { key: string; name: string } | undefined;
  /** Sun/moon events only change with the date and location, so refetch only when either does. */
  let astroCache: { key: string; sun?: SunData; moon?: MoonData } | undefined;
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const hourFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  });
  const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short' });

  return {
    id: 'weather',
    schema: weatherSchema,
    refreshMs: 15 * 60_000,
    timeoutMs: 10_000,
    isConfigured: () => coords !== undefined,
    setCoords(next) {
      coords = next;
    },
    async fetch(signal) {
      if (!coords) throw new Error('weather is not configured');
      const url =
        `https://api.met.no/weatherapi/locationforecast/2.0/complete` +
        `?lat=${coords.lat.toFixed(4)}&lon=${coords.lon.toFixed(4)}`;
      const res = await fetch(url, { signal, headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`met.no responded ${res.status}`);
      const { properties } = metSchema.parse(await res.json());
      const series = properties.timeseries;
      if (series.length === 0) throw new Error('met.no returned an empty timeseries');

      const now = series[0];
      const current = {
        temperature: now.data.instant.details.air_temperature,
        windSpeed: now.data.instant.details.wind_speed ?? 0,
        windDirectionDeg: now.data.instant.details.wind_from_direction,
        humidity: now.data.instant.details.relative_humidity,
        uvIndex: now.data.instant.details.ultraviolet_index_clear_sky,
        precipitationMm: now.data.next_1_hours?.details?.precipitation_amount,
        symbol: symbolOf(now),
      };

      const byDate = new Map<string, MetEntry[]>();
      for (const entry of series) {
        const date = dateFmt.format(new Date(entry.time));
        const bucket = byDate.get(date);
        if (bucket) bucket.push(entry);
        else byDate.set(date, [entry]);
      }

      // Same day window as `days` below, so every day tab in the hourly view has data behind it.
      const allowedDates = new Set([...byDate.keys()].slice(0, 7));

      const hours = series
        .map((entry) => ({ entry, date: dateFmt.format(new Date(entry.time)) }))
        .filter(({ entry, date }) => (entry.data.next_1_hours ?? entry.data.next_6_hours) && allowedDates.has(date))
        .map(({ entry, date }) => ({
          time: entry.time,
          date,
          hourLabel: hourFmt.format(new Date(entry.time)),
          temperature: entry.data.instant.details.air_temperature,
          // Beyond ~48h MET only reports 6-hourly buckets, so this becomes that bucket's total
          // rather than a true single hour's — the day view is still internally consistent since
          // a given far-out day is uniformly 6-hourly.
          precipitationMm:
            entry.data.next_1_hours?.details?.precipitation_amount ??
            entry.data.next_6_hours?.details?.precipitation_amount ??
            0,
          uvIndex: entry.data.instant.details.ultraviolet_index_clear_sky,
          windSpeed: entry.data.instant.details.wind_speed,
          humidity: entry.data.instant.details.relative_humidity,
          symbol: symbolOf(entry),
        }));

      const days = [...byDate.entries()].slice(0, 7).map(([date, entries]) => {
        const temps = entries.map((entry) => entry.data.instant.details.air_temperature);
        // Near-term days have hourly precipitation; far-term series is 6-hourly,
        // where summing next_6_hours across the (6h-spaced) entries doesn't double-count.
        const hourly = entries.filter((entry) => entry.data.next_1_hours);
        const precipitationMm = (hourly.length > 0 ? hourly : entries).reduce(
          (sum, entry) =>
            sum +
            ((hourly.length > 0
              ? entry.data.next_1_hours?.details?.precipitation_amount
              : entry.data.next_6_hours?.details?.precipitation_amount) ?? 0),
          0,
        );
        // Represent the day by the entry nearest 12:00 local.
        const midday = closestToMidday(entries, hourFmt);
        const uvValues = entries
          .map((entry) => entry.data.instant.details.ultraviolet_index_clear_sky)
          .filter((value): value is number => value != null);
        const windValues = entries
          .map((entry) => entry.data.instant.details.wind_speed)
          .filter((value): value is number => value != null);
        return {
          date,
          dayLabel: weekdayFmt.format(new Date(`${date}T12:00:00Z`)),
          minTemperature: Math.min(...temps),
          maxTemperature: Math.max(...temps),
          precipitationMm: Math.round(precipitationMm * 10) / 10,
          maxUvIndex: uvValues.length > 0 ? Math.max(...uvValues) : undefined,
          maxWindSpeed: windValues.length > 0 ? Math.max(...windValues) : undefined,
          humidity: midday.data.instant.details.relative_humidity,
          symbol: symbolOf(midday),
        };
      });

      const locationKey = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
      if (locationCache?.key !== locationKey) {
        locationCache = { key: locationKey, name: await reverseGeocode(coords, signal) };
      }

      const today = dateFmt.format(new Date());
      const astroKey = `${today}@${locationKey}`;
      if (astroCache?.key !== astroKey || (astroCache.sun === undefined && astroCache.moon === undefined)) {
        const astro = await fetchAstro(coords, today, utcOffsetLabel(timezone, new Date()), signal);
        astroCache = { key: astroKey, ...astro };
      }

      return {
        location: { ...coords, name: locationCache.name },
        current,
        hours,
        days,
        sun: astroCache.sun,
        moon: astroCache.moon,
      };
    },
  };
}
