import type { MinecraftLiveData } from '@nohm/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

/** Same reasoning as the Valorant live reading: a claim about this instant is worthless once it is
 * stale, and there is no finished-session card to fall back to. */
const LIVE_FRESH_MS = 3 * 60_000;

function formatSessionLength(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just started';
  if (minutes < 60) return `for ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `for ${hours}h` : `for ${hours}h ${remainder}m`;
}

function minecraftActivityLabel(live: MinecraftLiveData): string | undefined {
  if (live.activity === 'singleplayer') return live.destination ? `Singleplayer: ${live.destination}` : 'Singleplayer';
  if (live.activity === 'realm') return live.destination ? `Realm: ${live.destination}` : 'Realm';
  if (live.activity === 'server') return live.destination ? `Server: ${live.destination}` : 'Multiplayer';
  return undefined;
}

/**
 * One candidate, because one is all Minecraft can support: the game publishes no presence and has
 * no local API, so the reading behind this is inferred from its log. Presence and session length
 * are genuinely everything knowable without a mod running inside the game, and the card says that
 * much rather than dressing it up.
 */
export function minecraftCandidates(live: MinecraftLiveData | null | undefined, now: number = Date.now()): Candidate[] {
  if (!live) return [];
  const observedAt = Date.parse(live.observedAt);
  if (Number.isNaN(observedAt) || now - observedAt > LIVE_FRESH_MS) return [];

  const startedAt = Date.parse(live.startedAt);
  const sessionLength = Number.isNaN(startedAt) ? 'Playing now' : formatSessionLength(now - startedAt);
  const activity = minecraftActivityLabel(live);
  return [{
    id: 'minecraft:live', source: 'minecraft', kind: 'minecraft', score: 60, shapes: [...allShapes],
    kicker: 'Playing now', title: 'Minecraft', detail: sessionLength,
    href: '#/', render: { type: 'minecraft-slot', activity },
  }];
}
