import type { SteamData } from '@nohm/shared';

import type { Candidate, SteamMoments } from '../types.js';
import { allShapes } from './shapes.js';

function formatSteamHours(minutes: number): string {
  const hours = minutes / 60;
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
}

const DEFAULT_STEAM_MOMENTS: SteamMoments = { completedGame: false };

function steamCompletedGameCandidate(data: SteamData, moments: SteamMoments): Candidate | undefined {
  if (!moments.completedGame || !data.achievements) return undefined;
  const { appId, gameName, totalCount } = data.achievements;
  return {
    id: `steam:completed:${appId}`, source: 'steam', kind: 'steam', score: 92, shapes: [...allShapes],
    kicker: 'Game completed', title: gameName, detail: `All ${totalCount} achievements unlocked`,
    href: '#/steam', render: { type: 'text' },
  };
}

function steamAchievementCandidate(data: SteamData, achievementFreshMs: number, rareAchievementPercent: number): Candidate | undefined {
  const recentUnlock = data.achievements?.recentUnlocks[0];
  if (!recentUnlock || Date.now() - Date.parse(recentUnlock.unlockedAt) >= achievementFreshMs) return undefined;
  const rare = recentUnlock.globalUnlockedPercent !== undefined && recentUnlock.globalUnlockedPercent <= rareAchievementPercent;
  const rarity = recentUnlock.globalUnlockedPercent !== undefined
    ? `${recentUnlock.globalUnlockedPercent.toFixed(1)}% of players`
    : undefined;
  return {
    id: `steam:achievement:${data.achievements!.appId}:${recentUnlock.apiName}`, source: 'steam', kind: 'steam',
    score: rare ? 85 : 80, shapes: [...allShapes], kicker: rare ? 'Rare achievement unlocked' : 'Achievement unlocked', title: recentUnlock.displayName,
    detail: [data.achievements!.gameName, rarity].filter((value): value is string => Boolean(value)).join(' · '),
    href: '#/steam', render: { type: 'steam-achievement', appId: data.achievements!.appId, apiName: recentUnlock.apiName },
  };
}

function steamPlaytimeMilestoneCandidate(data: SteamData, moments: SteamMoments): Candidate | undefined {
  if (moments.playtimeMilestoneHours === undefined) return undefined;
  const trackedGame = data.currentGame ?? data.recentlyPlayed[0] ?? data.library?.mostPlayed[0];
  if (!trackedGame) return undefined;
  return {
    id: `steam:playtime-milestone:${trackedGame.appId}:${moments.playtimeMilestoneHours}`, source: 'steam', kind: 'steam',
    score: 65, shapes: ['secondary', 'tile'], kicker: 'Playtime milestone', title: `${moments.playtimeMilestoneHours}h in ${trackedGame.name}`,
    detail: 'Open Steam for the full breakdown', href: '#/steam', render: { type: 'text' },
  };
}

function steamNowPlayingCandidate(data: SteamData): Candidate | undefined {
  if (!data.currentGame) return undefined;
  const minutes = data.currentGame.playtimeForeverMinutes;
  return {
    id: `steam:now-playing:${data.currentGame.appId}`, source: 'steam', kind: 'steam', score: 58,
    shapes: ['secondary', 'tile'], kicker: 'Playing now', title: data.currentGame.name,
    detail: minutes !== undefined ? `${formatSteamHours(minutes)} played` : 'Open Steam',
    href: '#/steam', render: { type: 'steam-now-playing', appId: data.currentGame.appId },
  };
}

function steamLeaderboardClimbCandidate(moments: SteamMoments): Candidate | undefined {
  if (!moments.leaderboardClimb) return undefined;
  const { rank, delta } = moments.leaderboardClimb;
  return {
    id: `steam:leaderboard-climb:${rank}`, source: 'steam', kind: 'steam', score: 45, shapes: ['tile'],
    kicker: 'Friends leaderboard', title: `Up to #${rank + 1}`, detail: `Climbed ${delta} spot${delta === 1 ? '' : 's'}`,
    href: '#/steam', render: { type: 'text' },
  };
}

function steamFriendsOnlineCandidate(data: SteamData): Candidate | undefined {
  if (!data.friendsInGame.length) return undefined;
  const first = data.friendsInGame[0]!;
  return {
    id: 'steam:friends', source: 'steam', kind: 'steam', score: 25, shapes: ['tile'],
    kicker: 'Friends online',
    title: `${data.friendsInGame.length} friend${data.friendsInGame.length === 1 ? '' : 's'} playing`,
    detail: first.gameName, href: '#/steam', render: { type: 'text' },
  };
}

function steamRecentPlaytimeCandidate(data: SteamData): Candidate | undefined {
  const recentMinutes = data.library?.recentPlaytimeMinutes;
  const recentGameName = data.library?.mostPlayed[0]?.name ?? data.recentlyPlayed[0]?.name;
  if (!recentMinutes || !recentGameName) return undefined;
  return {
    id: 'steam:recent-playtime', source: 'steam', kind: 'steam', score: 22, shapes: ['tile'],
    kicker: 'This week on Steam', title: `${formatSteamHours(recentMinutes)} this week`, detail: recentGameName,
    href: '#/steam', render: { type: 'text' },
  };
}

/**
 * Only the first matching candidate is returned — a completion, an achievement unlock, a playtime
 * milestone, current game, friend activity, a leaderboard climb, and recent playtime would
 * otherwise all compete for slots from the same source. Order here doubles as the priority: a
 * fresh game completion beats a rare unlock, which beats a routine unlock, which beats a playtime
 * milestone, which beats just "playing now", down through the ambient filler signals.
 */
export function steamCandidates(
  data: SteamData | undefined,
  achievementFreshMs: number,
  moments: SteamMoments = DEFAULT_STEAM_MOMENTS,
  rareAchievementPercent = 10,
  suppressNowPlaying = false,
): Candidate[] {
  if (!data) return [];

  const candidate =
    steamCompletedGameCandidate(data, moments)
    ?? steamAchievementCandidate(data, achievementFreshMs, rareAchievementPercent)
    ?? steamPlaytimeMilestoneCandidate(data, moments)
    ?? (suppressNowPlaying ? undefined : steamNowPlayingCandidate(data))
    ?? steamLeaderboardClimbCandidate(moments)
    ?? steamFriendsOnlineCandidate(data)
    ?? steamRecentPlaytimeCandidate(data);

  return candidate ? [candidate] : [];
}
