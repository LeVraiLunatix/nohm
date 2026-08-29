import { describe, expect, it } from 'vitest';
import type { SteamData } from '@nohm/shared';
import { steamCandidates } from './steam.js';

describe('steamCandidates', () => {
  const ACHIEVEMENT_FRESH_MS = 7 * 24 * 60 * 60_000;

  const baseline: SteamData = {
    profile: { steamId: '76561198000000000', personaName: 'Alex', profileUrl: 'https://steamcommunity.com/id/alex' },
    currentGame: null,
    library: null,
    recentlyPlayed: [],
    achievements: null,
    friendsInGame: [],
    playtimeHistory: [],
    friendsLeaderboard: { status: 'unavailable', entries: [] },
    availability: { library: 'unavailable', achievements: 'unavailable', friends: 'unavailable' },
  };

  it('returns nothing when there is no data', () => {
    expect(steamCandidates(undefined, ACHIEVEMENT_FRESH_MS)).toEqual([]);
  });

  it('prioritizes a fresh achievement unlock over everything else', () => {
    const data: SteamData = {
      ...baseline,
      currentGame: { appId: 10, name: 'Half-Life' },
      friendsInGame: [{ steamId: '2', personaName: 'Sam', gameName: 'Half-Life' }],
      achievements: {
        appId: 10, gameName: 'Half-Life', unlockedCount: 1, totalCount: 10,
        recentUnlocks: [{
          apiName: 'ACH_1', displayName: 'Freeman', unlockedAt: new Date(Date.now() - 60_000).toISOString(), globalUnlockedPercent: 2.4,
        }],
      },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS)).toEqual([
      expect.objectContaining({
        id: 'steam:achievement:10:ACH_1', score: 85, kicker: 'Rare achievement unlocked', title: 'Freeman',
        detail: 'Half-Life · 2.4% of players', shapes: ['hero', 'secondary', 'tile'],
        render: { type: 'steam-achievement', appId: 10, apiName: 'ACH_1' },
      }),
    ]);
  });

  it('falls back to current game once the achievement unlock ages past the freshness threshold', () => {
    const data: SteamData = {
      ...baseline,
      currentGame: { appId: 10, name: 'Half-Life', playtimeForeverMinutes: 600 },
      achievements: {
        appId: 10, gameName: 'Half-Life', unlockedCount: 1, totalCount: 10,
        recentUnlocks: [{
          apiName: 'ACH_1', displayName: 'Freeman', unlockedAt: new Date(Date.now() - ACHIEVEMENT_FRESH_MS - 60_000).toISOString(),
        }],
      },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS)).toEqual([
      expect.objectContaining({
        id: 'steam:now-playing:10', score: 58, kicker: 'Playing now', title: 'Half-Life', detail: '10h played',
        shapes: ['secondary', 'tile'], render: { type: 'steam-now-playing', appId: 10 },
      }),
    ]);
  });

  it('leaves now-playing to a richer live source when asked to suppress it', () => {
    const data: SteamData = { ...baseline, currentGame: { appId: 252950, name: 'Rocket League' } };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS, { completedGame: false }, 10, true)).toEqual([]);
  });

  it('falls back to friends playing when nothing is currently running', () => {
    const data: SteamData = {
      ...baseline,
      friendsInGame: [
        { steamId: '2', personaName: 'Sam', gameName: 'Portal 2' },
        { steamId: '3', personaName: 'Jo', gameName: 'Portal 2' },
      ],
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS)).toEqual([
      expect.objectContaining({
        id: 'steam:friends', score: 25, kicker: 'Friends online', title: '2 friends playing', detail: 'Portal 2', shapes: ['tile'],
      }),
    ]);
  });

  it('falls back to recent playtime as the lowest-priority signal', () => {
    const data: SteamData = {
      ...baseline,
      library: { totalGames: 12, totalPlaytimeMinutes: 6_000, recentPlaytimeMinutes: 300, mostPlayed: [{ appId: 20, name: 'Portal' }], allGames: [{ appId: 20, name: 'Portal' }] },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS)).toEqual([
      expect.objectContaining({
        id: 'steam:recent-playtime', score: 22, kicker: 'This week on Steam', title: '5.0h this week', detail: 'Portal', shapes: ['tile'],
      }),
    ]);
  });

  it('returns nothing when there is no current activity, no fresh achievement, no friends, and no recent playtime', () => {
    expect(steamCandidates(baseline, ACHIEVEMENT_FRESH_MS)).toEqual([]);
  });

  it('boosts a rare fresh unlock above a routine one', () => {
    const data: SteamData = {
      ...baseline,
      achievements: {
        appId: 10, gameName: 'Half-Life', unlockedCount: 1, totalCount: 10,
        recentUnlocks: [{
          apiName: 'ACH_1', displayName: 'Freeman', unlockedAt: new Date(Date.now() - 60_000).toISOString(), globalUnlockedPercent: 3.2,
        }],
      },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS, { completedGame: false }, 10)).toEqual([
      expect.objectContaining({ id: 'steam:achievement:10:ACH_1', score: 85, kicker: 'Rare achievement unlocked' }),
    ]);
  });

  it('surfaces a fresh game completion over an achievement unlock', () => {
    const data: SteamData = {
      ...baseline,
      achievements: {
        appId: 10, gameName: 'Half-Life', unlockedCount: 10, totalCount: 10,
        recentUnlocks: [{ apiName: 'ACH_LAST', displayName: 'Finale', unlockedAt: new Date(Date.now() - 60_000).toISOString() }],
      },
    };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS, { completedGame: true })).toEqual([
      expect.objectContaining({
        id: 'steam:completed:10', score: 92, kicker: 'Game completed', title: 'Half-Life',
        detail: 'All 10 achievements unlocked', shapes: ['hero', 'secondary', 'tile'],
      }),
    ]);
  });

  it('surfaces a fresh playtime milestone for the tracked game', () => {
    const data: SteamData = { ...baseline, currentGame: { appId: 10, name: 'Half-Life', playtimeForeverMinutes: 3_000 } };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS, { completedGame: false, playtimeMilestoneHours: 50 })).toEqual([
      expect.objectContaining({
        id: 'steam:playtime-milestone:10:50', score: 65, kicker: 'Playtime milestone', title: '50h in Half-Life', shapes: ['secondary', 'tile'],
      }),
    ]);
  });

  it('surfaces a friends-leaderboard climb below now-playing but above friends online', () => {
    const data: SteamData = { ...baseline, friendsInGame: [{ steamId: '2', personaName: 'Sam', gameName: 'Portal 2' }] };

    expect(steamCandidates(data, ACHIEVEMENT_FRESH_MS, { completedGame: false, leaderboardClimb: { rank: 1, delta: 2 } })).toEqual([
      expect.objectContaining({
        id: 'steam:leaderboard-climb:1', score: 45, kicker: 'Friends leaderboard', title: 'Up to #2', detail: 'Climbed 2 spots', shapes: ['tile'],
      }),
    ]);
  });
});
