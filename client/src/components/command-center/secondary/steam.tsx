import type { ReactNode } from 'react';
import type { CommandCenterSlot, SteamData } from '@nohm/shared';
import { useArtFallback } from '../../../widgets/steam/shared';

function formatSteamHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

export function SteamNowPlayingSecondary({ slot, steam }: Readonly<{ slot: CommandCenterSlot; steam: SteamData | undefined }>): ReactNode {
  const appId = slot.render.type === 'steam-now-playing' ? slot.render.appId : undefined;
  const game = [steam?.currentGame, ...(steam?.recentlyPlayed ?? [])]
    .find((candidate) => candidate?.appId === appId);
  const art = useArtFallback([game?.headerUrl, game?.heroUrl]);
  if (slot.render.type !== 'steam-now-playing' || !game) return null;
  return <div className="mt-4">
    {art.src && <img src={art.src} alt="" className="w-full max-w-xs rounded-xl object-cover shadow-lg" onError={art.onError} />}
    <p className="command-hero-title mt-3 text-sm font-semibold text-ink">{game.name}</p>
    {game.playtimeForeverMinutes !== undefined && (
      <p className="mt-0.5 text-sm text-ink-muted">{formatSteamHours(game.playtimeForeverMinutes)} total playtime</p>
    )}
  </div>;
}

export function SteamAchievementSecondary({ slot, steam }: Readonly<{ slot: CommandCenterSlot; steam: SteamData | undefined }>): ReactNode {
  if (slot.render.type !== 'steam-achievement') return null;
  const { appId, apiName } = slot.render;
  const achievements = steam?.achievements?.appId === appId ? steam.achievements : undefined;
  const achievement = achievements?.recentUnlocks.find((a) => a.apiName === apiName);
  if (!achievement || !achievements) return null;
  return <div className="mt-4 flex items-center gap-3">
    {achievement.iconUrl ? (
      <img src={achievement.iconUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
    ) : (
      <div className="h-12 w-12 shrink-0 rounded-lg bg-track" />
    )}
    <div className="min-w-0">
      <p className="command-hero-title--compact text-sm font-semibold text-ink">{achievement.displayName}</p>
      <p className="mt-0.5 text-sm text-ink-muted">
        {achievements.unlockedCount}/{achievements.totalCount} unlocked
        {achievement.globalUnlockedPercent !== undefined ? ` · ${achievement.globalUnlockedPercent.toFixed(1)}% of players` : ''}
      </p>
    </div>
  </div>;
}
