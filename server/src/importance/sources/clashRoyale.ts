import type { ClashRoyaleBattle, ClashRoyaleData } from '@nohm/shared';
import { pathOfLegendsDisplayLeagueNumber, pathOfLegendsLeagueName } from '@nohm/shared';

import type { Candidate, ClashRoyaleMoments } from '../types.js';
import { allShapes } from './shapes.js';

/** Battles that actually affect the ladder — friendlies/challenges shouldn't count toward a streak
 * or session record. Filtering on `type` rather than `trophyChange` presence: Path of Legends
 * only reports `trophyChange` on a win, so a `trophyChange !== undefined` filter silently dropped
 * every PoL loss too, letting non-consecutive wins masquerade as one unbroken streak. */
const NON_LADDER_BATTLE_TYPES = new Set(['friendly', 'challenge', 'tournament', 'clanMate', 'boatBattle']);
function ladderBattles(battles: ClashRoyaleBattle[]): ClashRoyaleBattle[] {
  return battles.filter((battle) => !NON_LADDER_BATTLE_TYPES.has(battle.type));
}

function clashRoyaleArenaCandidate(moments: ClashRoyaleMoments, data: ClashRoyaleData): Candidate | undefined {
  if (!moments.newArena) return undefined;
  return {
    id: `clash-royale:arena:${moments.newArena}`, source: 'clash-royale', kind: 'clash-royale', score: 88, shapes: [...allShapes],
    kicker: 'New arena', title: moments.newArena,
    detail: `${data.profile.trophies.toLocaleString('en-US')} trophies`,
    href: '#/clash-royale', render: { type: 'clash-royale-moment', kind: 'arena', arenaName: moments.newArena },
  };
}

function clashRoyaleLeagueCandidate(moments: ClashRoyaleMoments): Candidate | undefined {
  if (!moments.newLeague) return undefined;
  return {
    id: `clash-royale:league:${moments.newLeague.leagueNumber}`, source: 'clash-royale', kind: 'clash-royale', score: 85, shapes: [...allShapes],
    kicker: 'Path of Legends', title: `League ${pathOfLegendsDisplayLeagueNumber(moments.newLeague.leagueNumber)}`,
    detail: `${moments.newLeague.trophies.toLocaleString('en-US')} Path of Legends trophies`,
    href: '#/clash-royale', render: { type: 'clash-royale-moment', kind: 'league', leagueNumber: moments.newLeague.leagueNumber },
  };
}

function clashRoyaleBestTrophiesCandidate(moments: ClashRoyaleMoments): Candidate | undefined {
  if (moments.newBestTrophies === undefined) return undefined;
  return {
    id: `clash-royale:best-trophies:${moments.newBestTrophies}`, source: 'clash-royale', kind: 'clash-royale', score: 80, shapes: [...allShapes],
    kicker: 'New personal best', title: `${moments.newBestTrophies.toLocaleString('en-US')} trophies`,
    detail: 'Your highest trophy count yet', href: '#/clash-royale',
    render: { type: 'clash-royale-moment', kind: 'best-trophies', bestTrophies: moments.newBestTrophies },
  };
}

function clashRoyaleWinStreakCandidate(data: ClashRoyaleData, winStreakMin: number, freshMs: number, now: number): Candidate | undefined {
  const ladder = ladderBattles(data.recentBattles);
  let streak = 0;
  for (const battle of ladder) {
    if (battle.result !== 'win') break;
    streak += 1;
  }
  const latest = ladder[0];
  if (streak < winStreakMin || !latest || now - Date.parse(latest.battleTime) >= freshMs) return undefined;
  const streakCrowns = ladder.slice(0, streak).reverse()
    .map((battle) => ({ crownsFor: battle.crownsFor, crownsAgainst: battle.crownsAgainst, battleTime: battle.battleTime }));
  // Path of Legends trophies reset every season, so restating them as a raw count reads as
  // meaningless noise — the league (its trophy-equivalent standing) is the stable, legible number.
  const detail = latest.type === 'pathOfLegend' && data.profile.pathOfLegends
    ? `Currently ${pathOfLegendsLeagueName(data.profile.pathOfLegends.leagueNumber)}`
    : `Currently ${data.profile.trophies.toLocaleString('en-US')} trophies`;
  // A short streak is common enough that it doesn't earn a whole secondary-carousel slide —
  // only a truly long run gets the richer secondary treatment; anything shorter is tile-only.
  const shapes: Candidate['shapes'] = streak > 10 ? [...allShapes] : ['tile'];
  // The badge shows the mode of the most recent streak win (trophy road / 2v2 / clan wars / merge
  // tactics / Path of Legends league) — same lookup the recent-battles pulse uses client-side.
  // `pathOfLegendsLeagueNumber` comes from the battle itself, not the player's current league, so
  // it stays correct even if the player has since been promoted or demoted.
  const streakBattleMode = {
    type: latest.type, modeName: latest.modeName, arenaName: latest.arenaName,
    pathOfLegendsLeagueNumber: latest.pathOfLegendsLeagueNumber,
  };
  return {
    id: `clash-royale:win-streak:${streak}:${latest.battleTime}`, source: 'clash-royale', kind: 'clash-royale', score: 70, shapes,
    kicker: 'Win streak', title: `${streak} wins in a row`,
    detail,
    href: '#/clash-royale', render: { type: 'clash-royale-moment', kind: 'win-streak', streakCrowns, streakBattleMode },
  };
}

/** Groups the newest ladder battles into one "session" — consecutive battles less than
 * `sessionGapMs` apart, walking backward from the most recent. A gap that wide means play
 * stopped, so an older, unrelated battle from earlier in the day doesn't get folded in. */
function clashRoyaleSession(battles: ClashRoyaleBattle[], sessionGapMs: number): ClashRoyaleBattle[] {
  const ladder = ladderBattles(battles);
  const first = ladder[0];
  if (!first) return [];
  const session = [first];
  let cursor = Date.parse(first.battleTime);
  for (const battle of ladder.slice(1)) {
    const time = Date.parse(battle.battleTime);
    if (cursor - time > sessionGapMs) break;
    session.push(battle);
    cursor = time;
  }
  return session;
}

/** The low-priority "you played" signal: a plain win/loss tally for whatever session the newest
 * battle belongs to, rather than a single battle result — several battles can land between polls,
 * so reporting just the latest one could hide a losing run right before a win, or vice versa. */
function clashRoyaleSessionCandidate(data: ClashRoyaleData, sessionGapMs: number, freshMs: number, now: number): Candidate | undefined {
  const session = clashRoyaleSession(data.recentBattles, sessionGapMs);
  const latest = session[0];
  if (!latest || now - Date.parse(latest.battleTime) >= freshMs) return undefined;
  const wins = session.filter((battle) => battle.result === 'win').length;
  const losses = session.filter((battle) => battle.result === 'loss').length;
  const draws = session.length - wins - losses;
  const record = [wins ? `${wins}W` : undefined, losses ? `${losses}L` : undefined, draws ? `${draws}D` : undefined]
    .filter((part): part is string => Boolean(part)).join('–') || '0W';
  const sessionCrowns = [...session].reverse()
    .map((battle) => ({ crownsFor: battle.crownsFor, crownsAgainst: battle.crownsAgainst, battleTime: battle.battleTime, result: battle.result }));
  return {
    id: `clash-royale:session:${latest.battleTime}`, source: 'clash-royale', kind: 'clash-royale', score: wins >= losses ? 26 : 22, shapes: ['tile'],
    kicker: 'This session', title: `${record} last session`,
    detail: `${session.length} battle${session.length === 1 ? '' : 's'} · ${data.profile.arenaName}`,
    href: '#/clash-royale', render: { type: 'clash-royale-moment', kind: 'session', sessionCrowns },
  };
}

/**
 * Milestones (new arena, new Path of Legends league, new personal best trophies) and a win streak
 * outrank the low-tier session tally — mirrors steamCandidates' priority ordering, but these are
 * independent facts rather than a single "pick the best one" chain, so several can be on the board
 * at once (e.g. a new arena reached mid win-streak).
 */
export function clashRoyaleCandidates(
  data: ClashRoyaleData | undefined,
  moments: ClashRoyaleMoments,
  winStreakMin: number,
  sessionGapMs: number,
  momentFreshMs: number,
  winStreakFreshMs: number,
  now = Date.now(),
): Candidate[] {
  if (!data) return [];
  return [
    clashRoyaleArenaCandidate(moments, data),
    clashRoyaleLeagueCandidate(moments),
    clashRoyaleBestTrophiesCandidate(moments),
    clashRoyaleWinStreakCandidate(data, winStreakMin, winStreakFreshMs, now),
    clashRoyaleSessionCandidate(data, sessionGapMs, momentFreshMs, now),
  ].filter((candidate): candidate is Candidate => candidate !== undefined);
}
