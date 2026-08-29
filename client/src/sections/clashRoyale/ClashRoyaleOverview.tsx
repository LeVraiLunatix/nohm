import { useEffect, useRef } from 'react';
import type { ClashRoyaleData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { ClashRoyaleBattlePulse, ClashRoyaleDeck, ClashRoyaleProfile } from '../../widgets/ClashRoyaleWidgets';
import { clashRoyaleArenaArt } from '../../lib/clashRoyale';
import './clashRoyale.css';

/* The whole overview card is one link (see SectionCard), same convention as SteamOverview. */

export function ClashRoyaleOverview() {
  const { envelope, offline } = useWidget<ClashRoyaleData>('clash-royale');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => (
        <ClashRoyaleOverviewContent data={data} />
      )}
    </WidgetBody>
  );
}

/** Same "preload, then set a CSS var on the ancestor section card" technique as
 * ValorantOverviewContent — the arena render belongs to the homepage card, establishing the
 * overall atmosphere rather than competing with the profile summary as a second mini-image. Not
 * every arena has art (see lib/clashRoyale.ts), in which case the card just renders without one. */
function ClashRoyaleOverviewContent({ data }: Readonly<{ data: ClashRoyaleData }>) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const arenaArtUrl = clashRoyaleArenaArt(data.profile.arenaName);

  useEffect(() => {
    const card = overviewRef.current?.closest<HTMLElement>('.dashboard-section-card--clash-royale');
    if (!card) return undefined;
    if (!arenaArtUrl) {
      card.style.removeProperty('--clash-royale-card-art');
      return undefined;
    }

    const probe = new Image();
    probe.onload = () => card.style.setProperty('--clash-royale-card-art', `url("${arenaArtUrl}")`);
    probe.src = arenaArtUrl;
    return () => {
      probe.onload = null;
      card.style.removeProperty('--clash-royale-card-art');
    };
  }, [arenaArtUrl]);

  return (
    <div ref={overviewRef} className="clash-overview">
      <ClashRoyaleProfile data={data} compact />
      <ClashRoyaleDeck data={data} compact />
      <ClashRoyaleBattlePulse data={data} />
    </div>
  );
}
