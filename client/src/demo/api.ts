// Installed only in the public demo build (see main.tsx, gated on import.meta.env.VITE_DEMO).
// The demo ships as a static site with no backend at all, so every `/api/*` call the app already
// makes has to be answered locally instead. A single window.fetch wrapper is the smallest way to
// do that: every widget, button and drag interaction keeps calling the same real endpoints it
// always does, completely unaware it's talking to fixtures instead of a server.
import type { CalendarData, HueData, SpotifyData, WidgetEnvelope } from '@nohm/shared';
import { buildDemoEnvelopes, spotifyNowPlayingAt } from './fixtures';
import { calendar } from './fixtures/calendar';

const LAYOUT_STORAGE_KEY = 'demo-layout';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

function readLayout(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeLayout(layout: Record<string, string[]>): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Private browsing / storage full — the reorder still works for this session, just won't persist.
  }
}

async function bodyOf(init: RequestInit | undefined): Promise<any> {
  if (!init?.body) return {};
  try {
    return JSON.parse(init.body as string);
  } catch {
    return {};
  }
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function resolveMethod(input: RequestInfo | URL, init: RequestInit | undefined): string {
  return (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
}

const WIDGET_ROUTE = /^\/api\/widgets\/([^/]+)(\/refresh)?$/;
const HUE_LIGHT_ROUTE = /^\/api\/hue\/lights\/([^/]+)$/;
const HUE_SCENE_ROUTE = /^\/api\/hue\/scenes\/([^/]+)$/;
const HUE_GROUP_ROUTE = /^\/api\/hue\/groups\/([^/]+)$/;
const LAYOUT_ITEM_ROUTE = /^\/api\/layout\/([^/]+)$/;

type Envelopes = Record<string, WidgetEnvelope>;

/** Every other widget is a static snapshot taken once at install time — fine, since nothing else
 * in the demo depends on wall-clock progress. Spotify's now-playing does: the client estimates
 * playback position locally from `progressMs` + time-since-`fetchedAt`, so a snapshot that never
 * changes eventually reads as "finished" and stays stuck there forever. Recomputing it fresh on
 * every poll (not just `/refresh`) is what makes the rotation actually advance. */
function refreshSpotifyNowPlaying(envelope: WidgetEnvelope): WidgetEnvelope {
  const now = new Date();
  const data = envelope.data as SpotifyData;
  const at = now.toISOString();
  return { ...envelope, fetchedAt: at, lastAttemptAt: at, data: { ...data, nowPlaying: spotifyNowPlayingAt(now) } };
}

/** Keep the made-up agenda anchored to the visitor's current date. Unlike a production calendar,
 * the demo cannot fetch a new event feed; rebuilding this relative fixture on every poll keeps a
 * long-lived tab from eventually treating every event as history. */
function refreshCalendar(envelope: WidgetEnvelope): WidgetEnvelope {
  const now = new Date();
  const at = now.toISOString();
  return { ...envelope, fetchedAt: at, lastAttemptAt: at, data: calendar(now) satisfies CalendarData };
}

// GET/POST /api/widgets/:id[/refresh]
function handleWidgetRoute(path: string, envelopes: Envelopes): Response | undefined {
  const match = WIDGET_ROUTE.exec(path);
  if (!match) return undefined;
  const id = match[1];
  const envelope = envelopes[id];
  if (!envelope) return jsonResponse({ id, status: 'loading', refreshMs: 60_000 } satisfies WidgetEnvelope);
  if (id === 'calendar') {
    envelopes[id] = refreshCalendar(envelope);
  } else if (id === 'spotify') {
    envelopes[id] = refreshSpotifyNowPlaying(envelope);
  } else if (match[2]) {
    const at = new Date().toISOString();
    envelopes[id] = { ...envelope, fetchedAt: at, lastAttemptAt: at };
  }
  return jsonResponse(envelopes[id]);
}

// Hue light/scene/group control — applied optimistically to the in-memory Hue envelope.
async function handleHueLightRoute(
  path: string,
  method: string,
  init: RequestInit | undefined,
  envelopes: Envelopes,
): Promise<Response | undefined> {
  const match = HUE_LIGHT_ROUTE.exec(path);
  if (!match || method !== 'POST') return undefined;
  const hue = envelopes.hue?.data as HueData | undefined;
  if (hue) {
    const state = await bodyOf(init);
    const light = hue.lights.find((l) => l.id === match[1]);
    if (light) {
      if (typeof state.on === 'boolean') light.on = state.on;
      if (typeof state.brightness === 'number') light.brightness = state.brightness;
    }
  }
  return jsonResponse({ ok: true });
}

function handleHueSceneRoute(path: string, method: string, envelopes: Envelopes): Response | undefined {
  const match = HUE_SCENE_ROUTE.exec(path);
  if (!match || method !== 'POST') return undefined;
  const hue = envelopes.hue?.data as HueData | undefined;
  const scene = hue?.scenes.find((s) => s.id === match[1]);
  if (hue && scene?.room) {
    const room = hue.rooms.find((r) => r.name === scene.room);
    if (room) room.anyOn = true;
  }
  return jsonResponse({ ok: true });
}

async function handleHueGroupRoute(
  path: string,
  method: string,
  init: RequestInit | undefined,
  envelopes: Envelopes,
): Promise<Response | undefined> {
  const match = HUE_GROUP_ROUTE.exec(path);
  if (!match || method !== 'POST') return undefined;
  const hue = envelopes.hue?.data as HueData | undefined;
  const room = hue?.rooms.find((r) => r.id === match[1]);
  if (room) {
    const state = await bodyOf(init);
    if (typeof state.on === 'boolean') room.anyOn = state.on;
  }
  return jsonResponse({ ok: true });
}

function handleCodeRoutes(path: string, method: string): Response | undefined {
  if (path === '/api/code/projects' && method === 'GET') {
    return jsonResponse({ projects: [{ repo: 'yourname/nohm' }, { repo: 'yourname/weekend-project' }] });
  }
  if (path === '/api/code/actions' && method === 'POST') {
    return jsonResponse({ ok: true });
  }
  return undefined;
}

async function handleGithubRoutes(path: string, method: string, init: RequestInit | undefined): Promise<Response | undefined> {
  if (path === '/api/github/repos' && method === 'GET') {
    return jsonResponse({ repos: ['yourname/nohm', 'yourname/weekend-project', 'yourname/dotfiles'] });
  }
  if (path === '/api/github/issues' && method === 'POST') {
    const body = await bodyOf(init);
    return jsonResponse({ number: 43, url: '#', title: body.title });
  }
  return undefined;
}

async function handleLayoutRoutes(path: string, method: string, init: RequestInit | undefined): Promise<Response | undefined> {
  if (path === '/api/layout' && method === 'GET') {
    return jsonResponse({ layout: readLayout() });
  }
  const match = LAYOUT_ITEM_ROUTE.exec(path);
  if (match && method === 'PUT') {
    const body = await bodyOf(init);
    const layout = readLayout();
    layout[match[1]] = Array.isArray(body.order) ? body.order : [];
    writeLayout(layout);
    return jsonResponse({ ok: true });
  }
  return undefined;
}

function handleWeatherRoutes(path: string, method: string): Response | undefined {
  if (path === '/api/weather/location' && method === 'POST') {
    return jsonResponse({ ok: true });
  }
  return undefined;
}

async function handleApiRoute(
  path: string,
  method: string,
  init: RequestInit | undefined,
  envelopes: Envelopes,
): Promise<Response> {
  return (
    handleWidgetRoute(path, envelopes) ??
    (await handleHueLightRoute(path, method, init, envelopes)) ??
    handleHueSceneRoute(path, method, envelopes) ??
    (await handleHueGroupRoute(path, method, init, envelopes)) ??
    handleCodeRoutes(path, method) ??
    (await handleGithubRoutes(path, method, init)) ??
    (await handleLayoutRoutes(path, method, init)) ??
    handleWeatherRoutes(path, method) ??
    notFound()
  );
}

/** Wraps window.fetch, answering every `/api/*` route the app calls from static, in-memory
 * fixtures. Most widget reads/refreshes are served straight from the fixture set built once at
 * install time; calendar and Spotify are rebased to the current time. The handful of write
 * endpoints (Hue, layout, code launcher, issue capture, device location) apply optimistically
 * to that same in-memory state so the demo feels alive — they never claim to persist anywhere
 * real. Anything outside `/api/` passes through untouched. */
export function installDemoApi(): void {
  const now = new Date();
  const envelopes = buildDemoEnvelopes(now);
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = resolveUrl(input);
    const method = resolveMethod(input, init);
    let path: string;
    try {
      path = new URL(url, window.location.origin).pathname;
    } catch {
      return realFetch(input, init);
    }
    if (!path.startsWith('/api/')) return realFetch(input, init);

    return handleApiRoute(path, method, init, envelopes);
  };
}
