import type { ValorantData } from '@nohm/shared';
import { iso, isoDaysAgo, mulberry32 } from '@nohm/shared';
import { valorantAgentIconUrl, valorantTierIconUrl, VALORANT_DEMO_CARD_WIDE_ART, VALORANT_DEMO_CARD_LARGE_ART } from '../../lib/valorant';

// ── Valorant ─────────────────────────────────────────────────────────────────────────────────

function valorantMatchesFor(
  now: Date,
  rng: () => number,
  count: number,
  daysAgoStart: number,
  daysAgoStep: number,
  actShort: string,
  idPrefix: string,
): ValorantData['recentMatches'] {
  const agents = ['Jett', 'Omen', 'Sova', 'Reyna', 'Killjoy'];
  const maps = ['Ascent', 'Bind', 'Haven', 'Lotus', 'Pearl', 'Sunset'];
  const matches: ValorantData['recentMatches'] = [];
  for (let i = 0; i < count; i++) {
    // Keep a recent loss in the demo form, while still consuming the seeded roll so every
    // following fixture value remains stable.
    const rolledWin = rng() > 0.45;
    const won = i === 1 ? false : rolledWin;
    // i === 0 is always the match MVP (see isMatchMvp below) on Jett (agents[0]) - fixed at
    // 27 so the showcased MVP performance reads as a standout, not an average game.
    const kills = i === 0 ? 27 : 12 + Math.round(rng() * 16);
    matches.push({
      matchId: `${idPrefix}-${i}`, map: maps[i % maps.length], mode: 'Competitive',
      startedAt: isoDaysAgo(now, daysAgoStart + i * daysAgoStep),
      result: won ? 'win' : 'loss',
      roundsWon: won ? 13 : 8 + Math.round(rng() * 4),
      roundsLost: won ? 8 + Math.round(rng() * 4) : 13,
      agentName: agents[i % agents.length],
      agentIconUrl: valorantAgentIconUrl(agents[i % agents.length]),
      score: kills * 27 + Math.round(rng() * 40),
      kills, deaths: 10 + Math.round(rng() * 8), assists: 3 + Math.round(rng() * 6),
      headshots: Math.round(kills * 0.3), bodyshots: Math.round(kills * 0.6), legshots: Math.round(kills * 0.1),
      damageDealt: kills * 145 + Math.round(rng() * 800), damageReceived: 1800 + Math.round(rng() * 900),
      actShort, isMatchMvp: i === 0, isTeamMvp: i === 0 || i === 3,
    });
  }
  return matches;
}

export function valorant(now: Date): ValorantData {
  const rng = mulberry32(777);
  // Current-act matches stay inside the last two weeks so the "2 weeks" / "Current act" period
  // options genuinely differ from "Career" once the previous act's matches are added below —
  // with everything crammed into one act inside 14 days, every period showed the same matches
  // and the period dropdown looked broken even though it was working correctly.
  const currentActMatches = valorantMatchesFor(now, rng, 10, 0.5, 0.9, 'e10a2', 'match');
  const previousActMatches = valorantMatchesFor(now, rng, 8, 26, 2.1, 'e9a3', 'archive');
  const wins = currentActMatches.filter((match) => match.result === 'win').length;
  return {
    profile: {
      name: 'yourname', tag: 'EUW', region: 'eu', accountLevel: 433,
      cardIconUrl: VALORANT_DEMO_CARD_WIDE_ART, cardBannerUrl: VALORANT_DEMO_CARD_LARGE_ART,
    },
    rank: { tierId: 22, tierName: 'Ascendant 2', tierIconUrl: valorantTierIconUrl(22), rr: 62, lastChange: 18, leaderboardRank: null },
    peak: { tierName: 'Immortal 1', tierIconUrl: valorantTierIconUrl(24), seasonShort: 'e8a1' },
    currentSeason: { wins, games: currentActMatches.length },
    recentMatches: currentActMatches,
    history: {
      matches: [...currentActMatches, ...previousActMatches],
      totalMatchesAvailable: 18, fetchedAt: iso(now, 0), currentActShort: 'e10a2',
    },
  };
}
