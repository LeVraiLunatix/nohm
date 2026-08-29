import type { SteamData } from '@nohm/shared';
import { dateDaysAgo, iso, mulberry32 } from '@nohm/shared';

// ── Steam ────────────────────────────────────────────────────────────────────────────────────

const steamHeaderUrl = (appId: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
// The real iconUrl Steam's API returns is derived from appid + an account-specific img_icon_url
// hash that doesn't exist for a fake account — the library cover art is a real, hash-free asset
// keyed only by appId, so it stands in for the per-account icon everywhere iconUrl is used
// (achievement progress ring, library grid tiles) instead of leaving those spots blank.
const steamIconUrl = (appId: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;

function steamGame(appId: number, name: string, foreverMin: number, recentMin: number) {
  return { appId, name, headerUrl: steamHeaderUrl(appId), iconUrl: steamIconUrl(appId), playtimeForeverMinutes: foreverMin, playtimeRecentMinutes: recentMin };
}

export function steam(now: Date): SteamData {
  const games = [
    steamGame(730, 'Counter-Strike 2', 48_200, 620),
    steamGame(1245620, 'ELDEN RING', 18_400, 340),
    steamGame(292030, 'The Witcher 3: Wild Hunt', 9_800, 0),
    steamGame(1091500, 'Cyberpunk 2077', 7_200, 180),
    steamGame(570, 'Dota 2', 32_600, 0),
    steamGame(440, 'Team Fortress 2', 5_100, 0),
  ];
  const rng = mulberry32(9001);
  const playtimeHistory = Array.from({ length: 60 }, (_, i) => {
    const daysAgo = 59 - i;
    const totalSoFar = games.reduce((sum, g) => sum + (g.playtimeForeverMinutes ?? 0), 0);
    return { date: dateDaysAgo(now, daysAgo), totalPlaytimeMinutes: Math.max(0, Math.round(totalSoFar - daysAgo * (280 + rng() * 120))) };
  });

  return {
    profile: { steamId: '76561197960287930', personaName: 'yourname', profileUrl: '#' },
    currentGame: games[0],
    library: {
      totalGames: 84,
      totalPlaytimeMinutes: games.reduce((sum, g) => sum + (g.playtimeForeverMinutes ?? 0), 0),
      recentPlaytimeMinutes: games.reduce((sum, g) => sum + (g.playtimeRecentMinutes ?? 0), 0),
      mostPlayed: games,
      allGames: games,
    },
    recentlyPlayed: [games[0], games[1], games[3]],
    achievements: {
      appId: 1245620, gameName: 'ELDEN RING', unlockedCount: 28, totalCount: 42,
      recentUnlocks: [
        { apiName: 'ACH_MALENIA', displayName: 'Shardbearer Malenia', description: 'Defeated Malenia, Blade of Miquella.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f704fcd82daf933dd3ce81c4d8ffea3ec65f26f4.jpg', unlockedAt: iso(now, -20), globalUnlockedPercent: 8.4 },
        { apiName: 'ACH_RADAHN', displayName: 'Shardbearer Radahn', description: 'Defeated Starscourge Radahn.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f5f1f41ef749459d9ac45750cd1f069d05fe1dd8.jpg', unlockedAt: iso(now, -70), globalUnlockedPercent: 22.1 },
        { apiName: 'ACH_GODRICK', displayName: 'Shardbearer Godrick', description: 'Defeated Godrick the Grafted.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/1e230f1a87d7139e854c47e52337f9d50856ac64.jpg', unlockedAt: iso(now, -200), globalUnlockedPercent: 61.3 },
      ],
      rarest: [
        { apiName: 'ACH_MALENIA', displayName: 'Shardbearer Malenia', description: 'Defeated Malenia, Blade of Miquella.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f704fcd82daf933dd3ce81c4d8ffea3ec65f26f4.jpg', unlockedAt: iso(now, -20), globalUnlockedPercent: 8.4 },
        { apiName: 'ACH_RADAHN', displayName: 'Shardbearer Radahn', description: 'Defeated Starscourge Radahn.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f5f1f41ef749459d9ac45750cd1f069d05fe1dd8.jpg', unlockedAt: iso(now, -70), globalUnlockedPercent: 22.1 },
      ],
      nextEasiest: [
        { apiName: 'ACH_ROUNDTABLE', displayName: 'Roundtable Hold', description: 'Arrived at the Roundtable Hold.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/f4e5fd19d3410470709632cd02b3136b5baca33d.jpg', globalUnlockedPercent: 94.2 },
        { apiName: 'ACH_GREATRUNE', displayName: 'Great Rune', description: 'Acquired a Great Rune.', iconUrl: 'https://shared.fastly.steamstatic.com/community_assets/images/apps/1245620/3881b1c355ffcc122655c134f988d6c1265cd8c9.jpg', globalUnlockedPercent: 88.7 },
      ],
    },
    friendsInGame: [
      { steamId: 'friend1', personaName: 'Alex', appId: 730, gameName: 'Counter-Strike 2' },
    ],
    playtimeHistory,
    friendsLeaderboard: {
      status: 'available',
      entries: [
        { steamId: '76561197960287930', personaName: 'yourname', totalPlaytimeMinutes: games.reduce((sum, g) => sum + (g.playtimeForeverMinutes ?? 0), 0), recentPlaytimeMinutes: 620, sharedGames: 84, isYou: true },
        { steamId: 'friend1', personaName: 'Alex', totalPlaytimeMinutes: 52_000, recentPlaytimeMinutes: 900, sharedGames: 61, isYou: false },
        { steamId: 'friend2', personaName: 'Jordan', totalPlaytimeMinutes: 21_400, recentPlaytimeMinutes: 120, sharedGames: 34, isYou: false },
        { steamId: 'friend3', personaName: 'Casey', sharedGames: 12, isYou: false },
      ],
    },
    availability: { library: 'available', achievements: 'available', friends: 'available' },
  };
}
