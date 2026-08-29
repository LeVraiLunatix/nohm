import { z } from 'zod';
import { powerDataSchema, type PowerArea, type PowerData, type PowerHour } from '@nohm/shared';
import type { Provider } from '../scheduler.js';
import { enturReverseGeocode } from './entur.js';

// Free, no-key day-ahead spot prices per Norwegian bidding area. Their API terms only ask for
// attribution, which the client widget renders ("Strømpriser levert av Hva koster strømmen.no").
const API_BASE = 'https://www.hvakosterstrommen.no/api/v1/prices';
const TRANSIENT_RETRY_DELAYS_MS = [500, 1_000];

const priceDaySchema = z.array(
  z.object({
    NOK_per_kWh: z.number(),
    time_start: z.string(),
  }),
);

type PriceEntry = z.infer<typeof priceDaySchema>[number];

export function mapPriceHours(entries: PriceEntry[], hourFmt: Intl.DateTimeFormat): PowerHour[] {
  return entries.map((hour) => ({
    time: hour.time_start,
    hourLabel: hourFmt.format(new Date(hour.time_start)),
    priceNokPerKwh: hour.NOK_per_kWh,
  }));
}

/** "prices/2026/07-18_NO3.json"-style path segments for a date in the dashboard timezone. */
export function priceDayPath(date: Date, dateFmt: Intl.DateTimeFormat, area: PowerArea): string {
  const formatted = dateFmt.format(date);
  return `${formatted.slice(0, 4)}/${formatted.slice(5)}_${area}.json`;
}

/**
 * Norwegian fylke (county) name -> Nord Pool bidding area, for auto-detecting the area from
 * coordinates the same way weather/transit do. Bidding zones are officially drawn per-municipality
 * and a handful of border municipalities don't follow their fylke's zone — config.json's
 * `power.area` always overrides this when set, so that edge case has an escape hatch.
 */
const AREA_BY_COUNTY: Record<string, PowerArea> = {
  Oslo: 'NO1',
  Akershus: 'NO1',
  Østfold: 'NO1',
  Buskerud: 'NO1',
  Innlandet: 'NO1',
  Vestfold: 'NO1',
  Telemark: 'NO1',
  Agder: 'NO2',
  Rogaland: 'NO2',
  'Møre og Romsdal': 'NO3',
  Trøndelag: 'NO3',
  Nordland: 'NO4',
  Troms: 'NO4',
  Finnmark: 'NO4',
  Vestland: 'NO5',
};

/** Entur's county names sometimes carry a Sámi co-name ("Troms - Romsa - Tromssa"); match by substring. */
export function resolveAreaFromCounty(county: string | undefined): PowerArea | undefined {
  if (!county) return undefined;
  const entry = Object.entries(AREA_BY_COUNTY).find(([name]) => county.includes(name));
  return entry?.[1];
}

const reverseGeocodeSchema = z.object({
  features: z.array(z.object({ properties: z.object({ county: z.string().optional() }) })),
});

async function resolveAreaFromCoords(coords: { lat: number; lon: number }, signal: AbortSignal): Promise<PowerArea> {
  const json = await enturReverseGeocode(coords, { size: '1' }, signal);
  const county = reverseGeocodeSchema.parse(json).features[0]?.properties.county;
  const area = resolveAreaFromCounty(county);
  if (!area) throw new Error(`could not resolve a bidding area for county "${county ?? 'unknown'}"`);
  return area;
}

async function waitForRetry(signal: AbortSignal, delayMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export interface PowerProvider extends Provider<PowerData> {
  /** Overrides the env-configured location, e.g. with the client's device geolocation — ignored once `power.area` is set explicitly in config.json. */
  setCoords(next: { lat: number; lon: number }): void;
}

export function createPowerProvider(
  configuredArea: PowerArea | undefined,
  fallbackCoords: { lat: number; lon: number } | undefined,
  timezone: string,
): PowerProvider {
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false });
  let coords = fallbackCoords;
  /** The resolved area only changes with the location, so re-resolve only when it does. */
  let areaCache: { key: string; area: PowerArea } | undefined;

  async function resolveArea(signal: AbortSignal): Promise<PowerArea> {
    if (configuredArea) return configuredArea;
    if (!coords) throw new Error('power is not configured');
    const key = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
    if (areaCache?.key !== key) {
      areaCache = { key, area: await resolveAreaFromCoords(coords, signal) };
    }
    return areaCache.area;
  }

  async function fetchDay(date: Date, area: PowerArea, signal: AbortSignal): Promise<PowerHour[] | undefined> {
    const url = `${API_BASE}/${priceDayPath(date, dateFmt, area)}`;
    let res: Response;
    for (let attempt = 0; ; attempt += 1) {
      try {
        res = await fetch(url, { signal });
        break;
      } catch (error) {
        // This free endpoint sits behind Cloudflare. Undici can also surface a destroyed HTTP/2
        // session while it replaces the connection, so give it two short, abort-aware retries.
        const delayMs = TRANSIENT_RETRY_DELAYS_MS[attempt];
        if (signal.aborted || !(error instanceof TypeError) || delayMs === undefined) throw error;
        await waitForRetry(signal, delayMs);
      }
    }
    // Tomorrow's prices 404 until Nord Pool publishes them (~13:00) — absent, not broken.
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`hvakosterstrommen responded ${res.status}`);
    return mapPriceHours(priceDaySchema.parse(await res.json()), hourFmt);
  }

  return {
    id: 'power',
    schema: powerDataSchema,
    // Prices change once a day; the point of polling is catching tomorrow's ~13:00 publication promptly.
    refreshMs: 20 * 60_000,
    // Allow one retry after Undici's 10-second connect timeout.
    timeoutMs: 25_000,
    isConfigured: () => configuredArea !== undefined || coords !== undefined,
    setCoords(next) {
      coords = next;
    },
    async fetch(signal) {
      const area = await resolveArea(signal);
      const [today, tomorrow] = await Promise.all([
        fetchDay(new Date(), area, signal),
        fetchDay(new Date(Date.now() + 24 * 60 * 60_000), area, signal),
      ]);
      if (!today) throw new Error('hvakosterstrommen has no prices for today');
      return { area, today, tomorrow: tomorrow ?? [] };
    },
  };
}
