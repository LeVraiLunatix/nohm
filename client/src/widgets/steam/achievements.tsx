import type { SteamData } from '@nohm/shared';
import { relativeTime } from '../../lib/time';
import { accent, findTrackedGame, useArtFallback } from './shared';

/** Rarity tier for a global-unlock percent, echoed as both text and color — never color alone. */
function rarityTier(percent: number): { label: string; color: string } {
  if (percent < 5) return { label: 'Ultra rare', color: 'light-dark(#a3195b, #ff5da8)' };
  if (percent < 15) return { label: 'Rare', color: 'light-dark(#7c3aed, #c4b5fd)' };
  if (percent < 35) return { label: 'Uncommon', color: 'light-dark(#0e7490, #22d3ee)' };
  return { label: 'Common', color: 'var(--color-ink-faint)' };
}

export function SteamAchievementsWidget({ data }: Readonly<{ data: SteamData }>) {
  if (data.availability.achievements !== 'available' || !data.achievements) {
    return (
      <p className="text-sm text-ink-faint">
        No achievement data for the tracked game — it may be private, or the game may not support achievements.
      </p>
    );
  }
  const { gameName, unlockedCount, totalCount, recentUnlocks } = data.achievements;
  const pct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Tracked game</p>
          <p className="truncate text-base font-semibold text-ink">{gameName}</p>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-ink-muted">
          {unlockedCount}/{totalCount} · {pct}%
        </p>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
      </div>
      {recentUnlocks.length === 0 ? (
        <p className="text-sm text-ink-faint">No unlocked achievements yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {recentUnlocks.slice(0, 5).map((achievement) => (
            <li key={achievement.apiName} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2">
              {achievement.iconUrl ? (
                <img src={achievement.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
              ) : (
                <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{achievement.displayName}</p>
                <p className="truncate text-xs text-ink-faint">
                  {relativeTime(achievement.unlockedAt)}
                  {achievement.globalUnlockedPercent !== undefined
                    ? ` · ${achievement.globalUnlockedPercent.toFixed(1)}% of players`
                    : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Header art for the tracked game — looked up by appId across the payload's game lists, since
 * achievements only carry the id/name, not art. Falls back to a plain fill if art 404s or the
 * game isn't in any list the client already has (shouldn't happen, but art is never load-bearing). */
function TrackedGameBanner({ data, appId, gameName }: Readonly<{ data: SteamData; appId: number; gameName: string }>) {
  const game = findTrackedGame(data, appId);
  const art = useArtFallback([game?.headerUrl, game?.heroUrl]);
  const hasArt = Boolean(art.src);
  return (
    <div className="steam-tracking-banner">
      {hasArt && (
        <img aria-hidden src={art.src} alt="" className="steam-tracking-banner-backdrop" />
      )}
      <div className="steam-tracking-banner-scrim" />
      <div className="relative flex items-center gap-3">
        {hasArt ? (
          <img src={art.src} alt="" className="steam-tracking-banner-thumb" onError={art.onError} />
        ) : (
          <div aria-hidden className="steam-tracking-banner-thumb steam-tracking-banner-thumb--fallback" />
        )}
        <div className="min-w-0">
          <p className="steam-eyebrow">Tracking</p>
          <p className="truncate text-sm font-semibold text-ink">{gameName}</p>
        </div>
      </div>
    </div>
  );
}

/** Rarest unlocked achievements plus the "most other players have this, you don't yet" locked
 * showcase — both computed server-side from Steam's global unlock-rate data. */
export function SteamAchievementShowcase({ data }: Readonly<{ data: SteamData }>) {
  if (data.availability.achievements !== 'available' || !data.achievements) {
    return <p className="text-sm text-ink-faint">No achievement highlights for the tracked game right now.</p>;
  }
  const { appId, gameName, rarest, nextEasiest } = data.achievements;
  if (rarest.length === 0 && nextEasiest.length === 0) {
    return <p className="text-sm text-ink-faint">No global rarity data for this game's achievements yet.</p>;
  }

  return (
    <div className="space-y-5">
      <TrackedGameBanner data={data} appId={appId} gameName={gameName} />
      {rarest.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Rarest unlocks</p>
          <ul className="space-y-2 text-sm">
            {rarest.map((achievement) => {
              const tier = rarityTier(achievement.globalUnlockedPercent!);
              return (
                <li key={achievement.apiName} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2">
                  {achievement.iconUrl ? (
                    <img src={achievement.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                  ) : (
                    <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{achievement.displayName}</p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-ink-faint">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: tier.color }} />
                      {tier.label} · {achievement.globalUnlockedPercent!.toFixed(1)}% of players
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {nextEasiest.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Next easiest</p>
          <ul className="space-y-2 text-sm">
            {nextEasiest.map((achievement) => (
              <li key={achievement.apiName} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 opacity-70">
                {achievement.iconUrl ? (
                  <img src={achievement.iconUrl} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover grayscale" />
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded-md bg-track" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{achievement.displayName}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {achievement.globalUnlockedPercent!.toFixed(1)}% of players have this
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
