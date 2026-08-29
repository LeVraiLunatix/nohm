import type { RobloxData } from '@nohm/shared';

import type { Candidate } from '../types.js';

const robloxCompactNumber = new Intl.NumberFormat('en', { notation: 'compact' });

/** Only surfaced while actually in a game — online/offline/in-studio presence isn't interesting
 * enough for the overview to compete for a slot. */
export function robloxCandidates(data: RobloxData | undefined): Candidate[] {
  if (data?.presence?.status !== 'in-game') return [];
  return [{
    id: 'roblox:now-playing', source: 'roblox', kind: 'roblox', score: 55,
    shapes: ['secondary', 'tile'], kicker: 'Playing now',
    title: data.presence.gameName ?? 'Roblox',
    detail: data.presence.playing !== undefined ? `${robloxCompactNumber.format(data.presence.playing)} playing now` : 'Open on Roblox',
    href: data.presence.placeId !== undefined ? `https://www.roblox.com/games/${data.presence.placeId}` : 'https://www.roblox.com/home',
    render: { type: 'roblox-now-playing' },
  }];
}
