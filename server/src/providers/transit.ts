import { z } from 'zod';
import { transitDataSchema, type TransitData } from '@nohm/shared';
import type { Provider } from '../scheduler.js';
import { ENTUR_CLIENT_NAME, enturReverseGeocode } from './entur.js';

const JOURNEY_PLANNER_URL = 'https://api.entur.io/journey-planner/v3/graphql';
/** How far ahead departures are requested, in seconds — enough to bridge night-time service gaps. */
const TIME_RANGE_S = 3 * 60 * 60;

const geocoderSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        id: z.string(),
        name: z.string(),
        /** Distance from the query point, in km. */
        distance: z.number().optional(),
      }),
    }),
  ),
});

const journeyPlannerSchema = z.object({
  data: z.object({
    stopPlaces: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        latitude: z.number().nullable(),
        longitude: z.number().nullable(),
        estimatedCalls: z.array(
          z.object({
            realtime: z.boolean(),
            cancellation: z.boolean(),
            aimedDepartureTime: z.string(),
            expectedDepartureTime: z.string(),
            destinationDisplay: z.object({ frontText: z.string() }).nullable(),
            serviceJourney: z.object({
              line: z.object({
                publicCode: z.string().nullable(),
                transportMode: z.string().nullable(),
                presentation: z.object({ colour: z.string().nullable() }).nullable(),
              }),
            }),
          }),
        ),
      }).nullable(),
    ),
  }),
});

const DEPARTURES_QUERY = `
query ($ids: [String]!, $departures: Int!, $timeRange: Int!) {
  stopPlaces(ids: $ids) {
    id
    name
    latitude
    longitude
    estimatedCalls(numberOfDepartures: $departures, timeRange: $timeRange) {
      realtime
      cancellation
      aimedDepartureTime
      expectedDepartureTime
      destinationDisplay { frontText }
      serviceJourney { line { publicCode transportMode presentation { colour } } }
    }
  }
}`;

export interface TransitSettings {
  /** NSR stop place ids you actually use, e.g. ["NSR:StopPlace:41613"] — shown whenever you're
   * within `favoriteRadiusMeters` of one of them, ahead of the auto-discovered nearby stops (which
   * can be a stop that's merely closer, not one with useful service). Empty = always auto-discover. */
  stopIds: string[];
  favoriteRadiusMeters: number;
  /** Cap and radius for the auto-discovered fallback, used when no favorite is close enough (or none are configured). */
  maxStops: number;
  nearbyRadiusMeters: number;
  departuresPerStop: number;
}

interface ResolvedStop {
  id: string;
  distanceMeters?: number;
}

type StopFeature = z.infer<typeof geocoderSchema>['features'][number];
type StopPlaceResult = NonNullable<z.infer<typeof journeyPlannerSchema>['data']['stopPlaces'][number]>;
type EstimatedCall = StopPlaceResult['estimatedCalls'][number];

export interface TransitProvider extends Provider<TransitData> {
  /** Overrides the env-configured location, e.g. with the client's device geolocation. */
  setCoords(next: { lat: number; lon: number }): void;
}

/** Great-circle distance in meters. Needed to check pinned favorite stops against the current
 * location — Entur's geocoder only searches *from* a point, it can't report distance *to* an
 * arbitrary stop id. */
export function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearby geocoder hits can repeat a stop name (paired directional platforms); keep the closest of each. */
export function selectNearestStops(features: StopFeature[], maxStops: number): ResolvedStop[] {
  const seenNames = new Set<string>();
  const stops: ResolvedStop[] = [];
  for (const feature of features) {
    const { id, name, distance } = feature.properties;
    if (!id.includes('StopPlace') || seenNames.has(name)) continue;
    seenNames.add(name);
    stops.push({ id, distanceMeters: distance !== undefined ? Math.round(distance * 1000) : undefined });
    if (stops.length >= maxStops) break;
  }
  return stops;
}

export function mapDepartures(calls: EstimatedCall[]): TransitData['stops'][number]['departures'] {
  return calls
    .filter((call) => !call.cancellation)
    .map((call) => ({
      line: call.serviceJourney.line.publicCode ?? '•',
      destination: call.destinationDisplay?.frontText ?? 'Unknown destination',
      mode: call.serviceJourney.line.transportMode ?? 'bus',
      aimedTime: call.aimedDepartureTime,
      expectedTime: call.expectedDepartureTime,
      realtime: call.realtime,
      color: call.serviceJourney.line.presentation?.colour
        ? `#${call.serviceJourney.line.presentation.colour.replace(/^#/, '')}`
        : undefined,
    }));
}

async function resolveNearestStops(
  coords: { lat: number; lon: number },
  maxStops: number,
  radiusMeters: number,
  signal: AbortSignal,
): Promise<ResolvedStop[]> {
  // Fetch more than needed so the name-dedupe (and radius filter) still leaves maxStops distinct stops.
  const json = await enturReverseGeocode(coords, { layers: 'venue', size: String(maxStops * 3) }, signal);
  const stops = selectNearestStops(geocoderSchema.parse(json).features, maxStops)
    .filter((stop) => stop.distanceMeters === undefined || stop.distanceMeters <= radiusMeters);
  if (stops.length === 0) throw new Error('entur geocoder returned no stop places nearby');
  return stops;
}

async function fetchStopPlaces(ids: string[], departuresPerStop: number, signal: AbortSignal): Promise<StopPlaceResult[]> {
  const res = await fetch(JOURNEY_PLANNER_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'ET-Client-Name': ENTUR_CLIENT_NAME },
    body: JSON.stringify({
      query: DEPARTURES_QUERY,
      variables: { ids, departures: departuresPerStop, timeRange: TIME_RANGE_S },
    }),
  });
  if (!res.ok) throw new Error(`entur journey-planner responded ${res.status}`);
  const parsed = journeyPlannerSchema.parse(await res.json());
  return parsed.data.stopPlaces.filter((place): place is StopPlaceResult => place !== null);
}

function toStopData(place: StopPlaceResult, distanceMeters: number | undefined): TransitData['stops'][number] {
  return {
    id: place.id,
    name: place.name,
    distanceMeters,
    departures: mapDepartures(place.estimatedCalls),
  };
}

export function createTransitProvider(
  fallbackCoords: { lat: number; lon: number } | undefined,
  settings: TransitSettings,
): TransitProvider {
  let coords = fallbackCoords;
  /** Nearest stops only change with the location, so re-resolve only when it does. */
  let stopsCache: { key: string; stops: ResolvedStop[] } | undefined;

  return {
    id: 'transit',
    schema: transitDataSchema,
    refreshMs: 60_000,
    timeoutMs: 10_000,
    isConfigured: () => settings.stopIds.length > 0 || coords !== undefined,
    setCoords(next) {
      coords = next;
    },
    async fetch(signal) {
      if (settings.stopIds.length > 0) {
        const favorites = await fetchStopPlaces(settings.stopIds, settings.departuresPerStop, signal);
        const withDistance = favorites.map((place) => ({
          place,
          distanceMeters: coords && place.latitude !== null && place.longitude !== null
            ? Math.round(haversineMeters(coords, { lat: place.latitude, lon: place.longitude }))
            : undefined,
        }));
        // No coords at all means we can't distance-check — fall back to the old "always show
        // the pinned stops" behavior rather than discarding them.
        const selected = coords
          ? withDistance.filter(({ distanceMeters }) => distanceMeters !== undefined && distanceMeters <= settings.favoriteRadiusMeters)
          : withDistance;
        if (selected.length > 0) {
          const sorted = selected.toSorted((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
          return {
            stops: sorted
              .map(({ place, distanceMeters }) => toStopData(place, distanceMeters)),
          };
        }
      }

      if (!coords) throw new Error('transit is not configured');
      const key = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
      if (stopsCache?.key !== key) {
        stopsCache = { key, stops: await resolveNearestStops(coords, settings.maxStops, settings.nearbyRadiusMeters, signal) };
      }
      const nearby = stopsCache.stops;
      const places = await fetchStopPlaces(nearby.map((stop) => stop.id), settings.departuresPerStop, signal);
      const distanceById = new Map(nearby.map((stop) => [stop.id, stop.distanceMeters]));
      return { stops: places.map((place) => toStopData(place, distanceById.get(place.id))) };
    },
  };
}
