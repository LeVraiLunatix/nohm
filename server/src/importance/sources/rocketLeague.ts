import type { RocketLeagueLiveData } from '@nohm/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

/** Same reasoning as the Valorant and Minecraft live readings: a claim about this instant is
 * worthless once it is stale, and there is no finished-match card to fall back to. */
const LIVE_FRESH_MS = 3 * 60_000;

function formatSessionLength(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'just started';
  if (minutes < 60) return `for ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `for ${hours}h` : `for ${hours}h ${remainder}m`;
}

/** The scoreline, when the reading carried one. Both halves are optional in the schema, so a
 * presence line that parsed without them still produces a usable card naming the arena. */
function scoreline(live: RocketLeagueLiveData): string | undefined {
  if (live.goalsFor === undefined || live.goalsAgainst === undefined) return undefined;
  return `${live.goalsFor}–${live.goalsAgainst}`;
}

/** Joins the parts of a card line that are actually present, so a reading missing its arena or
 * playlist degrades to a shorter line rather than one with a dangling separator. */
function joined(...parts: (string | undefined)[]): string {
  return parts.filter((part): part is string => part !== undefined && part !== '').join(' · ');
}

/**
 * One candidate, whichever of the three states the game is in. Unlike Minecraft next door, Rocket
 * League writes its Steam rich presence into its own log, so this can say what is being played and
 * how it is going — the playlist, the arena, the clock and the score — rather than only that the
 * game is open.
 */
export function rocketLeagueCandidates(live: RocketLeagueLiveData | null | undefined, now: number = Date.now()): Candidate[] {
  if (!live) return [];
  const observedAt = Date.parse(live.observedAt);
  if (Number.isNaN(observedAt) || now - observedAt > LIVE_FRESH_MS) return [];

  const startedAt = Date.parse(live.startedAt);
  const sessionLength = Number.isNaN(startedAt) ? undefined : formatSessionLength(now - startedAt);
  const score = scoreline(live);
  const common = {
    source: 'rocket-league' as const,
    kind: 'rocket-league' as const,
    shapes: [...allShapes],
    href: '#/',
    render: { type: 'rocket-league-slot' as const },
  };

  if (live.state === 'ingame') {
    return [{
      ...common,
      id: 'rocket-league:match',
      // A match in progress is the most interesting thing this source can report — it outranks the
      // bare "the game is open" reading the way a live Valorant match outranks the Riot launcher.
      score: 66,
      kicker: 'In a match',
      title: joined(score, live.map) || 'Rocket League',
      detail: joined(live.playlist, live.clock === undefined ? undefined : `${live.clock} left`),
    }];
  }

  if (live.state === 'postmatch') {
    return [{
      ...common,
      id: 'rocket-league:postmatch',
      score: 62,
      kicker: 'Full time',
      title: joined(score, live.map) || 'Rocket League',
      detail: joined(live.playlist, sessionLength),
    }];
  }

  return [{
    ...common,
    id: 'rocket-league:live',
    score: 58,
    kicker: 'Playing now',
    title: 'Rocket League',
    detail: sessionLength ?? 'Playing now',
    render: { type: 'rocket-league-slot', activity: 'In the menus' },
  }];
}
