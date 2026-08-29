import { describe, expect, it } from 'vitest';
import type { ValorantData, ValorantLiveData } from '@nohm/shared';
import { valorantCandidates } from './valorant.js';

const NOW = Date.parse('2026-08-21T22:00:00.000Z');

function live(overrides: Partial<ValorantLiveData>): ValorantLiveData {
  return { state: 'ingame', observedAt: new Date(NOW - 30_000).toISOString(), ...overrides };
}

function data(overrides: Partial<ValorantData> = {}): ValorantData {
  return {
    profile: { name: 'Player', tag: '0000', region: 'eu', accountLevel: 300 },
    rank: { tierId: 18, tierName: 'Diamond 1', rr: 42, lastChange: 19 },
    peak: { tierName: 'Diamond 2' },
    recentMatches: [],
    history: { matches: [], totalMatchesAvailable: 0, fetchedAt: new Date(NOW).toISOString() },
    ...overrides,
  } as ValorantData;
}

describe('valorantCandidates', () => {
  it('leads with the live match, carrying the round score as it stands', () => {
    const [candidate] = valorantCandidates(undefined, live({
      map: 'Abyss', mode: 'Competitive', roundsWon: 9, roundsLost: 7, partySize: 3,
    }), NOW);
    expect(candidate).toMatchObject({
      kicker: 'Valorant · in match', title: 'Abyss · 9–7', detail: 'Competitive · 3-stack',
    });
  });

  it('says so when Riot marks the player away mid-match', () => {
    const [candidate] = valorantCandidates(undefined, live({ map: 'Abyss', mode: 'Competitive', idle: true }), NOW);
    expect(candidate?.kicker).toBe('Valorant · away in match');
  });

  it('reports agent select and the menus as their own states', () => {
    expect(valorantCandidates(undefined, live({ state: 'pregame', map: 'Sunset', mode: 'Unrated' }), NOW)[0])
      .toMatchObject({ kicker: 'Valorant · agent select', title: 'Sunset' });
    expect(valorantCandidates(undefined, live({ state: 'menus', mode: 'Competitive' }), NOW)[0])
      .toMatchObject({ kicker: 'Valorant', title: 'In menus' });
  });

  it('calls the launcher the launcher rather than claiming Valorant', () => {
    expect(valorantCandidates(undefined, live({ state: 'riot' }), NOW)[0])
      .toMatchObject({ kicker: 'Riot Launcher', title: 'Online', detail: '' });
  });

  it('ignores a live reading that has gone stale and falls back to what did happen', () => {
    const stale = live({ state: 'ingame', map: 'Abyss', observedAt: new Date(NOW - 10 * 60_000).toISOString() });
    const [candidate] = valorantCandidates(data({
      recentMatches: [{
        matchId: 'm1', map: 'Abyss', mode: 'Competitive', startedAt: new Date(NOW - 40 * 60_000).toISOString(),
        durationSeconds: 1900, result: 'win', roundsWon: 13, roundsLost: 6, agentName: 'Jett',
        agentIconUrl: 'https://media.valorant-api.com/agents/jett/displayicon.png',
        score: 300, kills: 28, deaths: 11, assists: 5, headshots: 10, bodyshots: 20, legshots: 1,
        damageDealt: 4000, damageReceived: 3000, isMatchMvp: true, isTeamMvp: true,
      }],
    }), stale, NOW);
    expect(candidate).toMatchObject({
      kicker: 'Last Valorant match', title: 'Victory on Abyss · 13–6',
      render: {
        artUrl: 'https://wiki.playvalorant.com/en-us/images/Loading_Screen_Abyss.png',
        iconUrl: 'https://media.valorant-api.com/agents/jett/displayicon.png',
      },
    });
  });

  it('falls back to the standing rank when nothing recent happened', () => {
    expect(valorantCandidates(data(), null, NOW)[0]).toMatchObject({
      kicker: 'Valorant rank', title: 'Diamond 1', detail: '42 RR · +19 RR last game',
      render: {
        iconUrl: 'https://media.valorant-api.com/competitivetiers/03621f52-342b-cf4e-4f86-9350a49c6d04/18/smallicon.png',
        rank: { rr: 42, lastChange: 19 },
      },
    });
  });

  it('offers nothing at all when there is no data and nothing being played', () => {
    expect(valorantCandidates(undefined, null, NOW)).toEqual([]);
  });
});
