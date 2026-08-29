import { z } from 'zod';
import {
  hueDataSchema,
  type HueData,
  type HueLight,
  type HueRoom,
  type HueScene,
} from '@nohm/shared';
import { readHueToken, writeHueToken, type HueToken } from '../hueToken.js';
import type { Provider } from '../scheduler.js';

// All traffic goes through Philips' cloud (the official Remote API), so lights are
// controllable wherever this machine is — the bridge's LAN IP is never involved.
// The /route prefix proxies the classic local API paths verbatim.
const REMOTE_API = 'https://api.meethue.com';
const TOKEN_URL = 'https://api.meethue.com/v2/oauth2/token';

export interface HueConfig {
  clientId: string;
  clientSecret: string;
}

export interface HueProvider extends Provider<HueData> {
  /** Talks to the remote API directly — the Express route just calls this, no duplicated logic. */
  setLightState(id: string, state: { on?: boolean; brightness?: number }): Promise<void>;
  setGroupState(id: string, on: boolean): Promise<void>;
  activateScene(id: string): Promise<void>;
}

const bridgeLightSchema = z.object({
  name: z.string(),
  state: z.object({
    on: z.boolean(),
    bri: z.number().optional(),
    reachable: z.boolean().optional(),
  }),
});
const bridgeLightsSchema = z.record(z.string(), bridgeLightSchema);

const bridgeSceneSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  group: z.string().optional(),
  recycle: z.boolean().optional(),
});

const bridgeGroupSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  state: z.object({ any_on: z.boolean().optional() }).optional(),
});

// One full-state request per poll (lights + groups + scenes) instead of three cloud round trips.
const bridgeFullStateSchema = z.object({
  lights: bridgeLightsSchema,
  groups: z.record(z.string(), bridgeGroupSchema),
  scenes: z.record(z.string(), bridgeSceneSchema),
});

// CLIP v2 scene list — only mined for palette swatches, keyed back to v1 ids via id_v1.
const v2ScenesSchema = z.object({
  data: z.array(
    z.object({
      id_v1: z.string().optional(),
      palette: z
        .object({
          color: z
            .array(z.object({ color: z.object({ xy: z.object({ x: z.number(), y: z.number() }) }) }))
            .optional(),
          color_temperature: z
            .array(z.object({ color_temperature: z.object({ mirek: z.number().nullable() }) }))
            .optional(),
        })
        .nullable()
        .optional(),
    }),
  ),
});

const bridgeResultEntrySchema = z.union([
  z.object({ success: z.record(z.string(), z.unknown()) }),
  z.object({ error: z.object({ type: z.number(), address: z.string(), description: z.string() }) }),
]);
const bridgeResultArraySchema = z.array(bridgeResultEntrySchema);

/** Hue's v1 API returns HTTP 200 even on failure — the real result lives in this JSON array. */
export function assertNoBridgeError(raw: unknown): void {
  if (!Array.isArray(raw)) return;
  const results = bridgeResultArraySchema.parse(raw);
  const failure = results.find(
    (entry): entry is Extract<(typeof results)[number], { error: unknown }> => 'error' in entry,
  );
  if (failure) throw new Error(`Hue bridge error: ${failure.error.description}`);
}

/**
 * Returns a valid token record, refreshing (and re-persisting) when the access
 * token is within a minute of expiry. Hue rotates refresh tokens on every
 * refresh, so the new pair must always be saved. Never logs response bodies —
 * they carry the tokens themselves.
 */
async function currentToken(config: HueConfig, signal: AbortSignal): Promise<HueToken> {
  const token = readHueToken();
  if (!token) throw new Error('hue is not linked — run `npm run setup:hue -w server`');
  if (token.expires_at - Date.now() > 60_000) return token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
    }),
    signal,
  });
  if (!res.ok) throw new Error(`hue token refresh failed: ${res.status}`);
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const next: HueToken = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + json.expires_in * 1000,
    username: token.username,
  };
  writeHueToken(next);
  return next;
}

async function remoteRequest(
  config: HueConfig,
  method: string,
  path: string,
  body: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const token = await currentToken(config, signal);
  const res = await fetch(`${REMOTE_API}/route/api/${token.username}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) throw new Error(`hue ${method} ${path} failed: ${res.status}`);
  return res.json();
}

/**
 * Best-effort palette fetch from the CLIP v2 API — swatches are decorative, so
 * any failure degrades to colorless chips instead of failing the whole widget.
 */
async function fetchPalettes(
  config: HueConfig,
  signal: AbortSignal,
): Promise<Record<string, string[]>> {
  try {
    const token = await currentToken(config, signal);
    const res = await fetch(`${REMOTE_API}/route/clip/v2/resource/scene`, {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'hue-application-key': token.username,
      },
      signal,
    });
    if (!res.ok) return {};
    return mapPalettes(v2ScenesSchema.parse(await res.json()));
  } catch {
    return {};
  }
}

/** Hue's `bri` is 1-254 (never 0, off is a separate flag) — normalize to 1-100 for the schema. */
export function normalizeBrightness(bri: number = 254): number {
  return Math.min(100, Math.max(1, Math.round((bri / 254) * 100)));
}

export function denormalizeBrightness(percent: number): number {
  return Math.min(254, Math.max(1, Math.round((percent / 100) * 254)));
}

function gammaEncode(channel: number): number {
  const c = Math.max(0, channel);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

function toHex(r: number, g: number, b: number): string {
  const hex = (c: number) =>
    Math.round(Math.min(1, Math.max(0, c)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/**
 * CIE xy → sRGB hex at full brightness (swatches are decorative — the scene's
 * own dimming would just make every dot dark). Wide-gamut D65 matrix from
 * Philips' color conversion notes, normalized so the largest channel saturates.
 */
export function xyToHex(x: number, y: number): string {
  if (y <= 0) return '#000000';
  const X = x / y;
  const Z = (1 - x - y) / y;
  let r = X * 1.656492 - 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + 1.655397 + Z * 0.036152;
  let b = X * 0.051713 - 0.121364 + Z * 1.01153;
  const max = Math.max(r, g, b);
  if (max > 0) {
    r /= max;
    g /= max;
    b /= max;
  }
  return toHex(gammaEncode(r), gammaEncode(g), gammaEncode(b));
}

/** Mirek (1e6/K) → approximate RGB hex, via Tanner Helland's blackbody fit. */
export function mirekToHex(mirek: number): string {
  const kelvin = 1_000_000 / mirek;
  const t = kelvin / 100;
  const r = t >= 66 ? 1.2929 * (t - 60) ** -0.1332 : 1;
  const g = t >= 66 ? 1.1299 * (t - 60) ** -0.0755 : (0.3901 * Math.log(t) - 0.6318);
  let b = 1;
  if (t < 66) b = t <= 19 ? 0 : 0.5432 * Math.log(t - 10) - 1.1963;
  return toHex(r, g, b);
}

/** v1 scene id → palette hex swatches, from the CLIP v2 scene list. */
export function mapPalettes(v2Scenes: z.infer<typeof v2ScenesSchema>): Record<string, string[]> {
  const palettes: Record<string, string[]> = {};
  for (const scene of v2Scenes.data) {
    const v1Id = scene.id_v1?.split('/').pop();
    if (!v1Id || !scene.palette) continue;
    const colors = [
      ...(scene.palette.color ?? []).map((entry) => xyToHex(entry.color.xy.x, entry.color.xy.y)),
      ...(scene.palette.color_temperature ?? [])
        .filter((entry) => entry.color_temperature.mirek !== null)
        .map((entry) => mirekToHex(entry.color_temperature.mirek as number)),
    ];
    if (colors.length > 0) palettes[v1Id] = colors.slice(0, 5);
  }
  return palettes;
}

/** Rooms only — Entertainment/Zone groups would duplicate the same lights. */
export function mapRooms(
  groups: Record<string, { name: string; type?: string; state?: { any_on?: boolean } }>,
): HueRoom[] {
  return Object.entries(groups)
    .filter(([, group]) => group.type === 'Room')
    .map(([id, group]) => ({ id, name: group.name, anyOn: group.state?.any_on ?? false }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Only scenes created in the Hue app (GroupScenes) — recycled/utility scenes are internal. */
export function mapScenes(
  scenes: Record<string, { name: string; type?: string; group?: string; recycle?: boolean }>,
  groups: Record<string, { name: string }>,
  palettes: Record<string, string[]> = {},
): HueScene[] {
  return Object.entries(scenes)
    .filter(([, scene]) => scene.type === 'GroupScene' && !scene.recycle)
    .map(([id, scene]) => ({
      id,
      name: scene.name,
      room: (scene.group && groups[scene.group]?.name) || null,
      colors: palettes[id] ?? [],
    }))
    .sort(
      (a, b) => (a.room ?? '').localeCompare(b.room ?? '') || a.name.localeCompare(b.name),
    );
}

/** Brightness is left untouched when only toggling off, so the light remembers its level. */
export function buildLightStateBody(state: { on?: boolean; brightness?: number }): {
  on?: boolean;
  bri?: number;
} {
  const body: { on?: boolean; bri?: number } = {};
  if (state.on !== undefined) body.on = state.on;
  if (state.brightness !== undefined && state.on !== false) {
    body.bri = denormalizeBrightness(state.brightness);
  }
  return body;
}

export function createHueProvider(hue: HueConfig | undefined): HueProvider {
  async function controlRequest(path: string, body: unknown): Promise<void> {
    if (!hue) throw new Error('hue is not configured');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const raw = await remoteRequest(hue, 'PUT', path, body, controller.signal);
      assertNoBridgeError(raw);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    id: 'hue',
    schema: hueDataSchema,
    // Cloud polling — coarser than the old LAN cadence to stay well inside
    // Philips' remote rate limits; control actions force a refresh anyway.
    refreshMs: 60_000,
    timeoutMs: 10_000,
    isConfigured: () => hue !== undefined && readHueToken() !== undefined,
    async fetch(signal): Promise<HueData> {
      if (!hue) throw new Error('hue is not configured');
      const [raw, palettes] = await Promise.all([
        remoteRequest(hue, 'GET', '', undefined, signal),
        fetchPalettes(hue, signal),
      ]);
      assertNoBridgeError(raw);
      const state = bridgeFullStateSchema.parse(raw);
      const lights: HueLight[] = Object.entries(state.lights).map(([id, light]) => ({
        id,
        name: light.name,
        on: light.state.on,
        brightness: normalizeBrightness(light.state.bri),
        reachable: light.state.reachable ?? true,
      }));
      return {
        lights,
        rooms: mapRooms(state.groups),
        scenes: mapScenes(state.scenes, state.groups, palettes),
      };
    },
    async setLightState(id, state): Promise<void> {
      await controlRequest(`/lights/${id}/state`, buildLightStateBody(state));
    },
    async setGroupState(id, on): Promise<void> {
      await controlRequest(`/groups/${id}/action`, { on });
    },
    async activateScene(id): Promise<void> {
      // Group 0 is the built-in all-lights group; recalling a scene through it
      // applies the scene to the lights stored in the scene itself.
      await controlRequest('/groups/0/action', { scene: id });
    },
  };
}
