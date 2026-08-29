import { describe, expect, it } from 'vitest';
import type { ClashOfClansData } from '@nohm/shared';
import { clashOfClansCandidates } from './clashOfClans.js';

describe('clashOfClansCandidates', () => {
  const NOW = Date.parse('2026-07-29T12:00:00Z');

  const baseline: ClashOfClansData = {
    profile: {
      tag: '#PLAYER1', name: 'Alex', townHallLevel: 15, trophies: 4000,
      clanTag: '#CLAN1', clanName: 'My Clan',
    },
    war: null,
    raidWeekend: null,
  };

  it('returns nothing when there is no data', () => {
    expect(clashOfClansCandidates(undefined, NOW)).toEqual([]);
  });

  it('returns nothing when not in a war and no raid weekend', () => {
    expect(clashOfClansCandidates(baseline, NOW)).toEqual([]);
  });

  it('surfaces war preparation day as a low-priority tile', () => {
    const data: ClashOfClansData = {
      ...baseline,
      war: {
        state: 'preparation', opponentName: 'Rival Clan', endTime: new Date(NOW + 90 * 60_000).toISOString(),
        attacksUsed: 0, attacksTotal: 2, clanStars: 0, clanDestructionPercentage: 0, opponentStars: 0, opponentDestructionPercentage: 0,
      },
    };
    expect(clashOfClansCandidates(data, NOW)).toContainEqual(
      expect.objectContaining({
        source: 'clash-of-clans', kind: 'clash-of-clans', score: 45, shapes: ['secondary', 'tile'],
        kicker: 'War preparation', title: 'War starts in 1 h 30 min', detail: 'vs Rival Clan',
      }),
    );
  });

  it('promotes an in-progress war to a hero-eligible slot when attacks remain and the war ends soon', () => {
    const data: ClashOfClansData = {
      ...baseline,
      war: {
        state: 'inWar', opponentName: 'Rival Clan', endTime: new Date(NOW + 2 * 60 * 60_000).toISOString(),
        attacksUsed: 1, attacksTotal: 2, clanStars: 12, clanDestructionPercentage: 55, opponentStars: 10, opponentDestructionPercentage: 48,
      },
    };
    expect(clashOfClansCandidates(data, NOW)).toContainEqual(
      expect.objectContaining({
        score: 84, shapes: ['hero', 'secondary', 'tile'],
        kicker: 'Clan war', title: '1 attack left in war', detail: '12★ vs 10★ · Rival Clan',
      }),
    );
  });

  it('keeps an in-progress war at tile priority once attacks are used up', () => {
    const data: ClashOfClansData = {
      ...baseline,
      war: {
        state: 'inWar', endTime: new Date(NOW + 2 * 60 * 60_000).toISOString(),
        attacksUsed: 2, attacksTotal: 2, clanStars: 20, clanDestructionPercentage: 90, opponentStars: 18, opponentDestructionPercentage: 85,
      },
    };
    expect(clashOfClansCandidates(data, NOW)).toContainEqual(
      expect.objectContaining({ score: 58, shapes: ['secondary', 'tile'], title: 'War ends in 2 h' }),
    );
  });

  it('does not surface a war that has already ended', () => {
    const data: ClashOfClansData = {
      ...baseline,
      war: {
        state: 'inWar', endTime: new Date(NOW - 60_000).toISOString(),
        attacksUsed: 2, attacksTotal: 2, clanStars: 20, clanDestructionPercentage: 90, opponentStars: 18, opponentDestructionPercentage: 85,
      },
    };
    expect(clashOfClansCandidates(data, NOW)).toEqual([]);
  });

  it('promotes an ongoing raid weekend to hero-eligible when attacks remain and it ends soon', () => {
    const data: ClashOfClansData = {
      ...baseline,
      raidWeekend: {
        state: 'ongoing', endTime: new Date(NOW + 3 * 60 * 60_000).toISOString(),
        attacksUsed: 4, attacksLimit: 6, capitalTotalLoot: 12_345, personalLoot: 1_800,
      },
    };
    expect(clashOfClansCandidates(data, NOW)).toContainEqual(
      expect.objectContaining({
        score: 80, shapes: ['hero', 'secondary', 'tile'],
        kicker: 'Raid weekend', title: '2 raid attacks left', detail: '1,800 looted by you · 12,345 clan total',
      }),
    );
  });

  it('does not surface a raid weekend that has ended', () => {
    const data: ClashOfClansData = {
      ...baseline,
      raidWeekend: {
        state: 'ended', endTime: new Date(NOW - 60_000).toISOString(),
        attacksUsed: 6, attacksLimit: 6, capitalTotalLoot: 50_000, personalLoot: 9_000,
      },
    };
    expect(clashOfClansCandidates(data, NOW)).toEqual([]);
  });

  it('surfaces the current league as a low-priority tile with the current trophy count', () => {
    const data: ClashOfClansData = {
      ...baseline,
      profile: { ...baseline.profile, league: { name: 'Titan League 26', iconUrl: 'https://api-assets.clashofclans.com/leaguetiers/326/abc.png' } },
    };
    expect(clashOfClansCandidates(data, NOW)).toContainEqual(
      expect.objectContaining({
        source: 'clash-of-clans', kind: 'clash-of-clans', score: 24, shapes: ['tile'],
        kicker: 'Current league', title: 'Titan League 26', detail: '4,000 trophies',
        href: 'https://link.clashofclans.com/en?action=OpenPlayerProfile&tag=%23PLAYER1',
      }),
    );
  });

  it('points the href at the clan\'s Supercell deep link', () => {
    const data: ClashOfClansData = {
      ...baseline,
      war: {
        state: 'preparation', endTime: new Date(NOW + 60 * 60_000).toISOString(),
        attacksUsed: 0, attacksTotal: 2, clanStars: 0, clanDestructionPercentage: 0, opponentStars: 0, opponentDestructionPercentage: 0,
      },
    };
    expect(clashOfClansCandidates(data, NOW)).toContainEqual(
      expect.objectContaining({ href: 'https://link.clashofclans.com/en?action=OpenClanProfile&tag=%23CLAN1' }),
    );
  });
});
