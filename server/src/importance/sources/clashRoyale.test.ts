import { describe, expect, it } from 'vitest';
import type { ClashRoyaleBattle, ClashRoyaleData } from '@nohm/shared';
import { clashRoyaleCandidates } from './clashRoyale.js';
import type { ClashRoyaleMoments } from '../types.js';

describe('clashRoyaleCandidates', () => {
  const NOW = Date.parse('2026-07-22T12:00:00Z');
  const FRESH_MS = 24 * 60 * 60_000;
  const SESSION_GAP_MS = 30 * 60_000;
  const WIN_STREAK_MIN = 3;
  const WIN_STREAK_FRESH_MS = 6 * 60 * 60_000;
  const NO_MOMENTS = {};

  function battle(overrides: Partial<ClashRoyaleBattle>): ClashRoyaleBattle {
    return {
      battleTime: new Date(NOW - 5 * 60_000).toISOString(),
      type: 'PvP', result: 'win', crownsFor: 1, crownsAgainst: 0, trophyChange: 30,
      ...overrides,
    };
  }

  const baseline: ClashRoyaleData = {
    profile: {
      tag: '#ABC123', name: 'Alex', expLevel: 40, trophies: 5432, bestTrophies: 5432,
      wins: 100, losses: 80, threeCrownWins: 20, battleCount: 180, arenaName: 'Legendary Arena',
    },
    currentDeck: [], recentBattles: [],
  };

  it('returns nothing when there is no data', () => {
    expect(clashRoyaleCandidates(undefined, NO_MOMENTS, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW)).toEqual([]);
  });

  it('surfaces a new arena milestone', () => {
    const moments: ClashRoyaleMoments = { newArena: 'Legendary Arena' };
    expect(clashRoyaleCandidates(baseline, moments, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW)).toContainEqual(
      expect.objectContaining({
        id: 'clash-royale:arena:Legendary Arena', score: 88, kicker: 'New arena', title: 'Legendary Arena',
        detail: '5,432 trophies', shapes: ['hero', 'secondary', 'tile'],
      }),
    );
  });

  it('surfaces a new Path of Legends league', () => {
    const moments: ClashRoyaleMoments = { newLeague: { leagueNumber: 8, trophies: 3120 } };
    expect(clashRoyaleCandidates(baseline, moments, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW)).toContainEqual(
      expect.objectContaining({
        id: 'clash-royale:league:8', score: 85, kicker: 'Path of Legends', title: 'League 11',
        detail: '3,120 Path of Legends trophies',
      }),
    );
  });

  it('surfaces a new personal best', () => {
    const moments: ClashRoyaleMoments = { newBestTrophies: 5600 };
    expect(clashRoyaleCandidates(baseline, moments, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW)).toContainEqual(
      expect.objectContaining({
        id: 'clash-royale:best-trophies:5600', score: 80, kicker: 'New personal best', title: '5,600 trophies',
      }),
    );
  });

  it('surfaces a fresh win streak, ignoring friendly battles that break the ladder chain', () => {
    const data: ClashRoyaleData = {
      ...baseline,
      recentBattles: [
        battle({ battleTime: new Date(NOW - 5 * 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - 10 * 60_000).toISOString(), type: 'friendly', trophyChange: undefined, result: 'loss' }),
        battle({ battleTime: new Date(NOW - 15 * 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - 20 * 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - 25 * 60_000).toISOString(), result: 'loss' }),
      ],
    };

    expect(clashRoyaleCandidates(data, NO_MOMENTS, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW)).toContainEqual(
      expect.objectContaining({ id: expect.stringContaining('clash-royale:win-streak:3:'), score: 70, title: '3 wins in a row' }),
    );
  });

  it('drops a win streak once it ages past its own (shorter) freshness window, even while still inside the general moment window', () => {
    const data: ClashRoyaleData = {
      ...baseline,
      recentBattles: [
        battle({ battleTime: new Date(NOW - WIN_STREAK_FRESH_MS - 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - WIN_STREAK_FRESH_MS - 65_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - WIN_STREAK_FRESH_MS - 70_000).toISOString(), result: 'win' }),
      ],
    };

    expect(clashRoyaleCandidates(data, NO_MOMENTS, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW).map((c) => c.id))
      .not.toContainEqual(expect.stringContaining('win-streak'));
  });

  it('does not surface a streak below the configured minimum', () => {
    const data: ClashRoyaleData = {
      ...baseline,
      recentBattles: [
        battle({ battleTime: new Date(NOW - 5 * 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - 10 * 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - 15 * 60_000).toISOString(), result: 'loss' }),
      ],
    };

    expect(clashRoyaleCandidates(data, NO_MOMENTS, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW).map((c) => c.id))
      .not.toContainEqual(expect.stringContaining('win-streak'));
  });

  it('tallies the current session as a low-tier tile', () => {
    const data: ClashRoyaleData = {
      ...baseline,
      recentBattles: [
        battle({ battleTime: new Date(NOW - 2 * 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - 8 * 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - 15 * 60_000).toISOString(), result: 'loss' }),
        // Outside the 30-minute session gap from the battle before it — excluded from the tally.
        battle({ battleTime: new Date(NOW - 90 * 60_000).toISOString(), result: 'win' }),
      ],
    };

    expect(clashRoyaleCandidates(data, NO_MOMENTS, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW)).toContainEqual(
      expect.objectContaining({
        kicker: 'This session', title: '2W–1L last session', detail: '3 battles · Legendary Arena',
        score: 26, shapes: ['tile'],
      }),
    );
  });

  it('drops the session tally once it ages past the freshness window', () => {
    const data: ClashRoyaleData = {
      ...baseline,
      recentBattles: [battle({ battleTime: new Date(NOW - FRESH_MS - 60_000).toISOString(), result: 'win' })],
    };

    expect(clashRoyaleCandidates(data, NO_MOMENTS, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW).map((c) => c.id))
      .not.toContainEqual(expect.stringContaining('session'));
  });

  it('lets a milestone and a win streak coexist rather than picking just one', () => {
    const data: ClashRoyaleData = {
      ...baseline,
      recentBattles: [
        battle({ battleTime: new Date(NOW - 5 * 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - 10 * 60_000).toISOString(), result: 'win' }),
        battle({ battleTime: new Date(NOW - 15 * 60_000).toISOString(), result: 'win' }),
      ],
    };
    const moments: ClashRoyaleMoments = { newArena: 'Legendary Arena' };

    const ids = clashRoyaleCandidates(data, moments, WIN_STREAK_MIN, SESSION_GAP_MS, FRESH_MS, WIN_STREAK_FRESH_MS, NOW).map((c) => c.id);
    expect(ids).toContainEqual(expect.stringContaining('clash-royale:arena:'));
    expect(ids).toContainEqual(expect.stringContaining('clash-royale:win-streak:'));
  });
});
