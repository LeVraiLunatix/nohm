import { describe, expect, it } from 'vitest';
import { isValorantWinRateEligibleMode } from '@nohm/shared';

describe('Valorant win-rate mode eligibility', () => {
  it.each([
    'Competitive',
    'Unrated',
    'Swiftplay',
    'Spike Rush',
    'Escalation',
    'Team Deathmatch',
    'Replication',
    'Snowball Fight',
    'All Random One Site',
    'New Map',
    'Skirmish 2v2',
    'Skirmish: Ascension 1v1',
    'Skirmish: Ascension 2v2',
  ])('includes team-result matchmaking mode %s', (mode) => {
    expect(isValorantWinRateEligibleMode(mode)).toBe(true);
  });

  it.each(['Custom Game', 'Range', 'Tutorial', 'Deathmatch', 'Unknown', 'ShootingRange'])(
    'excludes utility or non-team mode %s',
    (mode) => {
      expect(isValorantWinRateEligibleMode(mode)).toBe(false);
    },
  );
});
