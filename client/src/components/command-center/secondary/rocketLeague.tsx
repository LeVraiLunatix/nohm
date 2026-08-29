import type { ReactNode } from 'react';
import type { CommandCenterSlot } from '@nohm/shared';
import { GameActivityText } from './gameActivity';

const ROCKET_LEAGUE_ART_URL = 'https://cdn.akamai.steamstatic.com/steam/apps/252950/header.jpg';

/** Gives local Rocket League presence the same tactile art treatment as Steam's now-playing card.
 * The session data is still local-log data, so it also represents Epic-launched sessions. */
export function RocketLeagueNowPlayingSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'rocket-league-slot') return null;
  return <div className="mt-4">
    <img src={ROCKET_LEAGUE_ART_URL} alt="" className="w-full max-w-xs rounded-xl object-cover shadow-lg" />
    <GameActivityText slot={slot} className="mt-3" />
  </div>;
}
