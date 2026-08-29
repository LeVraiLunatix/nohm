const GEOCODER_URL = 'https://api.entur.io/geocoder/v1/reverse';

// Identify ourselves as Entur's API terms require (ET-Client-Name: <owner>-<application>).
export const ENTUR_CLIENT_NAME = 'joachimvn-nohm';

/** Raw reverse-geocode response — callers apply their own zod schema to the parts they need. */
export async function enturReverseGeocode(
  coords: { lat: number; lon: number },
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const url = new URL(GEOCODER_URL);
  url.searchParams.set('point.lat', coords.lat.toFixed(4));
  url.searchParams.set('point.lon', coords.lon.toFixed(4));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { signal, headers: { 'ET-Client-Name': ENTUR_CLIENT_NAME } });
  if (!res.ok) throw new Error(`entur geocoder responded ${res.status}`);
  return res.json();
}
