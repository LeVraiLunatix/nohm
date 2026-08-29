import type { ClashRoyaleData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { ClashRoyaleBattleLog, ClashRoyaleDeck, ClashRoyaleProfile } from '../../widgets/ClashRoyaleWidgets';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import './clashRoyale.css';

export function ClashRoyaleDetail() {
  const { envelope, offline } = useWidget<ClashRoyaleData>('clash-royale');

  return (
    <div>
      <DetailIntro
        title="Clash Royale"
        description="Your Trophy Road, Ranked standing, deck lineup, and recent battles."
        accent="var(--color-accent-clash-royale)"
      />

      <DetailSectionHeading title="Trophy Road & Ranked" />
      <WidgetShell title="Arena profile">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleProfile data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading title="Your eight cards" />
      <WidgetShell title="Current deck">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleDeck data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading title="Recent battles" />
      <WidgetShell title="Battle history">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <ClashRoyaleBattleLog data={data} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
