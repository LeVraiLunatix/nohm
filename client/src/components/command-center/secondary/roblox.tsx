import type { ReactNode } from 'react';
import type { CommandCenterSlot, RobloxData } from '@nohm/shared';
import { publicAsset } from '../../../lib/publicAsset';
import { FallbackSecondary } from './fallback';

const robloxCompactNumber = new Intl.NumberFormat('en', { notation: 'compact' });

export function RobloxNowPlayingSecondary({ slot, roblox }: Readonly<{ slot: CommandCenterSlot; roblox: RobloxData | undefined }>): ReactNode {
  const presence = roblox?.presence;
  if (slot.render.type !== 'roblox-now-playing' || presence?.status !== 'in-game') return <FallbackSecondary slot={slot} />;
  const gameIcon = presence.iconUrl ? (
    <img src={presence.iconUrl} alt="" className="command-roblox-icon" />
  ) : (
    <span className="command-roblox-icon command-roblox-icon--fallback" aria-hidden><img src={publicAsset('roblox/icon.svg')} alt="" /></span>
  );
  return <div className="command-roblox-now">
    {gameIcon}
    <div className="command-roblox-details">
      <div className="command-roblox-brand" aria-label="Roblox">
        <img src={publicAsset('roblox/wordmark.svg')} alt="Roblox" />
        <span>In game</span>
      </div>
      <div className="command-roblox-game">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">{presence.gameName ?? 'Roblox'}</p>
          <dl className="command-roblox-stats">
            {presence.playing !== undefined && <div><dt>Playing now</dt><dd>{robloxCompactNumber.format(presence.playing)}</dd></div>}
            {presence.visits !== undefined && <div><dt>Visits</dt><dd>{robloxCompactNumber.format(presence.visits)}</dd></div>}
          </dl>
        </div>
      </div>
    </div>
  </div>;
}
