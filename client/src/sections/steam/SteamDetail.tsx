import type { SteamData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import {
  SteamAchievementShowcase,
  SteamAchievementsWidget,
  SteamActivityHero,
  SteamFriendsLeaderboard,
  SteamFriendsWidget,
  SteamGameList,
  SteamPlaytimeTrend,
  SteamRecentGames,
} from '../../widgets/steam';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';
import './steam.css';

/** Full-width band below the "Steam activity" title (see DetailIntro's `layout="stacked"`) — the
 * hero card folds profile, tracked game, and library stats together with the tracked game's art
 * bleeding to the card's right edge; the playtime trend chart is its own full-width row beneath. */
function SteamSignals() {
  const { envelope, offline } = useWidget<SteamData>('steam');
  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => (
        <div className="space-y-5">
          <SteamActivityHero data={data} />
          <SteamPlaytimeTrend data={data} />
        </div>
      )}
    </WidgetBody>
  );
}

export function SteamDetail() {
  const { envelope, offline } = useWidget<SteamData>('steam');

  return (
    <div>
      <DetailIntro
        title="Steam activity"
        description="Your current game, playtime trend, library totals, and achievement progress for whichever game is tracked right now."
        accent="var(--color-accent-steam)"
        layout="stacked"
      >
        <SteamSignals />
      </DetailIntro>

      <DetailSectionHeading
        title="Recently played and achievements"
        detail="Achievement progress tracks the current game, or the most recently played one when you're not in-game."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WidgetShell title="Recently played">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SteamRecentGames data={data} />}
          </WidgetBody>
        </WidgetShell>
        <WidgetShell title="Achievements">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SteamAchievementsWidget data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <DetailSectionHeading
        title="Tracked game highlights"
        detail="Rarest unlocks and the achievements you're closest to in your current or most recently played game, ranked by Steam's global unlock rate."
      />
      <WidgetShell title="Achievement highlights">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <SteamAchievementShowcase data={data} />}
        </WidgetBody>
      </WidgetShell>

      <DetailSectionHeading
        title="Playtime leaderboard"
        detail="Ranked by all-time playtime across your Steam friends; private libraries stay listed, just unranked."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <WidgetShell title="Leaderboard">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SteamFriendsLeaderboard data={data} />}
          </WidgetBody>
        </WidgetShell>
        <WidgetShell title="Playing now">
          <WidgetBody envelope={envelope} offline={offline}>
            {(data) => <SteamFriendsWidget data={data} />}
          </WidgetBody>
        </WidgetShell>
      </div>

      <DetailSectionHeading
        title="All your games"
        detail="Sorted by all-time or last-2-weeks playtime — the only two windows Steam's API tracks."
      />
      <WidgetShell title="Games">
        <WidgetBody envelope={envelope} offline={offline}>
          {(data) => <SteamGameList data={data} />}
        </WidgetBody>
      </WidgetShell>
    </div>
  );
}
