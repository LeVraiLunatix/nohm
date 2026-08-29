import type { ClashOfClansData } from '@nohm/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

/** War day and raid weekend both run for hours, not minutes — this only needs to be as fresh as
 * the command-center provider's own 60s refresh, so a plain formatted string (baked in at fetch
 * time) is fine here, unlike calendar events' live browser-side countdown. */
function formatDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** Supercell's own deep-link scheme (used by their site and in-game share links) — opens the clan
 * profile in the app if installed, otherwise its web fallback. Falls back to the marketing site
 * when the player's clan tag isn't known yet (shouldn't normally happen once war/raid data exists). */
function clanHref(clanTag: string | undefined): string {
  return clanTag
    ? `https://link.clashofclans.com/en?action=OpenClanProfile&tag=${encodeURIComponent(clanTag)}`
    : 'https://www.clashofclans.com/';
}

/** Ending soon with attacks still unused is the actionable state — worth a hero/secondary slot,
 * not just a tile — mirroring how weather's severeCandidate outranks its other, ambient signals. */
const URGENT_WAR_HORIZON_MS = 3 * 60 * 60_000;
const URGENT_RAID_HORIZON_MS = 6 * 60 * 60_000;

/** Same deep-link scheme as clanHref, opening the player's own profile instead. */
function playerHref(playerTag: string): string {
  return `https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=${encodeURIComponent(playerTag)}`;
}

function pluralize(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}

/** `bestTrophies` is a leftover from the pre-revamp, never-resetting trophy system — it isn't a
 * "personal best" on the same scale as the new league trophies, which reset roughly weekly, so
 * pairing them (e.g. "39 trophies · best 5,037") reads as a nonsensical collapse against a season
 * that just started, not a real high-water mark. Just show the current count. */
function leagueCandidate(profile: ClashOfClansData['profile']): Candidate | undefined {
  if (!profile.league) return undefined;
  return {
    id: `clash-of-clans:league:${profile.league.name}`, source: 'clash-of-clans', kind: 'clash-of-clans', score: 24, shapes: ['tile'],
    kicker: 'Current league', title: profile.league.name,
    detail: `${profile.trophies.toLocaleString('en-US')} trophies`,
    href: playerHref(profile.tag),
    render: { type: 'clash-of-clans-moment', kind: 'league', leagueIconUrl: profile.league.iconUrl, trophies: profile.trophies },
  };
}

function warCandidate(war: ClashOfClansData['war'], clanTag: string | undefined, now: number): Candidate | undefined {
  if (!war) return undefined;
  const msRemaining = Date.parse(war.endTime) - now;
  if (msRemaining <= 0) return undefined;
  const href = clanHref(clanTag);

  if (war.state === 'preparation') {
    return {
      id: `clash-of-clans:war:preparation:${war.endTime}`, source: 'clash-of-clans', kind: 'clash-of-clans', score: 45,
      shapes: ['secondary', 'tile'], kicker: 'War preparation', title: `War starts in ${formatDuration(msRemaining)}`,
      detail: war.opponentName ? `vs ${war.opponentName}` : 'Opponent revealed once war day starts',
      href, render: { type: 'clash-of-clans-moment', kind: 'war-preparation', opponentName: war.opponentName },
    };
  }

  const attacksRemaining = Math.max(0, war.attacksTotal - war.attacksUsed);
  const urgent = attacksRemaining > 0 && msRemaining < URGENT_WAR_HORIZON_MS;
  const opponentSuffix = war.opponentName ? ` · ${war.opponentName}` : '';
  const detail = `${war.clanStars}★ vs ${war.opponentStars}★${opponentSuffix}`;
  const title = attacksRemaining > 0
    ? `${attacksRemaining} ${pluralize(attacksRemaining, 'attack')} left in war`
    : `War ends in ${formatDuration(msRemaining)}`;
  return {
    id: `clash-of-clans:war:in-war:${war.endTime}:${war.attacksUsed}`, source: 'clash-of-clans', kind: 'clash-of-clans',
    score: urgent ? 84 : 58, shapes: urgent ? [...allShapes] : ['secondary', 'tile'],
    kicker: 'Clan war', title,
    detail, href,
    render: { type: 'clash-of-clans-moment', kind: 'war', opponentName: war.opponentName, clanStars: war.clanStars, opponentStars: war.opponentStars },
  };
}

function raidWeekendCandidate(raidWeekend: ClashOfClansData['raidWeekend'], profile: ClashOfClansData['profile'], now: number): Candidate | undefined {
  if (raidWeekend?.state !== 'ongoing') return undefined;
  const msRemaining = Date.parse(raidWeekend.endTime) - now;
  if (msRemaining <= 0) return undefined;

  const attacksRemaining = Math.max(0, raidWeekend.attacksLimit - raidWeekend.attacksUsed);
  const urgent = attacksRemaining > 0 && msRemaining < URGENT_RAID_HORIZON_MS;
  const title = attacksRemaining > 0
    ? `${attacksRemaining} raid ${pluralize(attacksRemaining, 'attack')} left`
    : `Raid weekend ends in ${formatDuration(msRemaining)}`;
  return {
    id: `clash-of-clans:raid-weekend:${raidWeekend.endTime}:${raidWeekend.attacksUsed}`, source: 'clash-of-clans', kind: 'clash-of-clans',
    score: urgent ? 80 : 50, shapes: urgent ? [...allShapes] : ['secondary', 'tile'],
    kicker: 'Raid weekend', title,
    // Generic fallback text (used verbatim only by the tile-detail default) — the tile itself
    // overrides this with a personal-loot-only render, and secondary/hero use the full render
    // payload below, so this string only surfaces if a card ever falls through to plain `detail`.
    detail: `${raidWeekend.personalLoot.toLocaleString('en-US')} looted by you · ${raidWeekend.capitalTotalLoot.toLocaleString('en-US')} clan total`,
    href: clanHref(profile.clanTag),
    render: {
      type: 'clash-of-clans-moment', kind: 'raid-weekend',
      capitalTotalLoot: raidWeekend.capitalTotalLoot, personalLoot: raidWeekend.personalLoot,
      clanName: profile.clanName, clanBadgeUrl: profile.clanBadgeUrl,
      topContributors: raidWeekend.topContributors,
    },
  };
}

export function clashOfClansCandidates(data: ClashOfClansData | undefined, now = Date.now()): Candidate[] {
  if (!data) return [];
  return [
    warCandidate(data.war, data.profile.clanTag, now),
    raidWeekendCandidate(data.raidWeekend, data.profile, now),
    leagueCandidate(data.profile),
  ].filter((candidate): candidate is Candidate => candidate !== undefined);
}
