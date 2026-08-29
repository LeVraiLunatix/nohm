import type { ClashRoyaleData } from '@nohm/shared';
import { isoDaysAgo, mulberry32 } from '@nohm/shared';
import { clashRoyaleCardArt, CLASH_ROYALE_DEMO_CLAN_BADGE_URL } from '../../lib/clashRoyale';

// ── Clash Royale ─────────────────────────────────────────────────────────────────────────────

function clashRoyaleCard(id: number, name: string, level: number, maxLevel: number, rarity: string) {
  return { id, name, level, maxLevel, rarity, iconUrl: clashRoyaleCardArt(name) };
}

export function clashRoyale(now: Date): ClashRoyaleData {
  const deck = [
    {
      ...clashRoyaleCard(27000006, 'Tesla', 12, 13, 'common'),
      evolutionLevel: 1,
      iconUrl: 'https://static.wikia.nocookie.net/clashroyale/images/7/7b/TeslaCardEvolution.png',
    },
    clashRoyaleCard(26000000, 'Knight', 14, 14, 'common'),
    clashRoyaleCard(26000015, 'Baby Dragon', 11, 13, 'epic'),
    clashRoyaleCard(26000024, 'Mini P.E.K.K.A', 13, 13, 'common'),
    clashRoyaleCard(28000000, 'Fireball', 12, 13, 'rare'),
    clashRoyaleCard(28000008, 'Zap', 13, 13, 'common'),
    clashRoyaleCard(26000012, 'Musketeer', 13, 13, 'common'),
    clashRoyaleCard(26000037, 'Hog Rider', 13, 13, 'rare'),
  ];
  const battles: ClashRoyaleData['recentBattles'] = [];
  const ladder = { type: 'PvP', modeName: 'Ladder' };
  const pathOfLegends = { type: 'pathOfLegend', modeName: 'Path of Legend', pathOfLegendsLeagueNumber: 1 };
  const twoVTwo = { type: '2v2', modeName: '2v2' };
  const clanWar = { type: 'riverRacePvP', modeName: 'CW_Battle_1v1' };
  const mergeTactics = { type: 'mergeTactics', modeName: 'Merge Tactics', arenaName: 'Bronze III' };
  // This is deliberately not round-robin: a real recent history leans toward Trophy Road, with
  // occasional Path, party, Clan War, and Merge Tactics games mixed in. Each Path battle carries
  // its own leagueNumber (matching the profile's current league here), same as the real API.
  const battleModes = [
    ladder, twoVTwo, pathOfLegends, ladder, mergeTactics,
    ladder, clanWar, pathOfLegends, ladder, twoVTwo,
    ladder, mergeTactics, ladder, pathOfLegends, ladder,
  ];
  const rng = mulberry32(4242);
  for (let i = 0; i < 15; i++) {
    const won = rng() > 0.42;
    // A battle's crown score is never a draw in Clash Royale ladder play — keep crownsFor/
    // crownsAgainst strictly on the winning side's side of the result, or a "win" can roll a
    // scoreline like 1-1 that reads as a tie even though the result field says otherwise.
    let crownsFor = won ? 1 + Math.round(rng() * 2) : Math.round(rng() * 1);
    let crownsAgainst = won ? Math.round(rng() * 1) : 1 + Math.round(rng() * 2);
    if (won) crownsAgainst = Math.min(crownsAgainst, crownsFor - 1);
    else crownsFor = Math.min(crownsFor, crownsAgainst - 1);
    const mode = battleModes[i];
    battles.push({
      battleTime: isoDaysAgo(now, i * 0.6),
      ...mode,
      result: won ? 'win' : 'loss',
      crownsFor, crownsAgainst,
      opponentName: ['Ragnar', 'Freya', 'Bjorn', 'Astrid', 'Leif'][i % 5],
      trophyChange: won ? 24 + Math.round(rng() * 8) : -(24 + Math.round(rng() * 8)),
    });
  }
  return {
    profile: {
      tag: '#YOURTAG', name: 'yourname', expLevel: 47, trophies: 9127, bestTrophies: 9127,
      wins: 3420, losses: 3180, threeCrownWins: 890, battleCount: 6600,
      arenaName: 'Legendary Arena', clanName: 'Northern Lights', clanTag: '#CLANTAG',
      clanBadgeUrl: CLASH_ROYALE_DEMO_CLAN_BADGE_URL,
      pathOfLegends: { leagueNumber: 1, trophies: 4820, rank: 1240 },
    },
    currentDeck: deck,
    towerTroop: clashRoyaleCard(26000050, 'Cannoneer', 6, 9, 'common'),
    recentBattles: battles,
  };
}
