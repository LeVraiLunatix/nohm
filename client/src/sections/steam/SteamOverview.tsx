import { useEffect, useRef } from 'react';
import type { SteamAchievement, SteamData, SteamGame } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { relativeTime } from '../../lib/time';
import { findTrackedGame, useArtFallback } from '../../widgets/steam/shared';
import './steam.css';

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

/** Same ring language as the weather overview's humidity gauge — a stroke-dasharray circle
 * reads faster at this size than the flat progress bar it replaces. The tracked game's own
 * square icon sits in the ring's hollow center, so the ring reads as "this game" at a glance. */
function AchievementRing({ pct, iconUrl }: Readonly<{ pct: number; iconUrl?: string }>) {
  const r = 15;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="steam-pulse-ring">
      <svg viewBox="0 0 36 36" className="steam-pulse-ring-svg -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-track)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="var(--color-accent-steam)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
        />
      </svg>
      {iconUrl && <img src={iconUrl} alt="" aria-hidden loading="lazy" className="steam-pulse-ring-icon" />}
    </div>
  );
}

function AchievementBadge({ achievement }: Readonly<{ achievement: SteamAchievement }>) {
  return (
    <li className="steam-pulse-badge">
      {achievement.iconUrl ? (
        <img src={achievement.iconUrl} alt="" loading="lazy" />
      ) : (
        <span aria-hidden className="steam-pulse-badge-fallback">★</span>
      )}
      <div className="min-w-0">
        <p className="steam-pulse-badge-name">{achievement.displayName}</p>
        <p className="steam-pulse-badge-date">
          {relativeTime(achievement.unlockedAt)}
          {achievement.globalUnlockedPercent !== undefined && ` · ${achievement.globalUnlockedPercent.toFixed(1)}% have it`}
        </p>
      </div>
    </li>
  );
}

/** Looks up the tracked achievement game's square icon across every game list the overview
 * already has in hand, rather than growing the achievements payload with a duplicate field. */
function findTrackedGameIcon(data: SteamData, appId: number): string | undefined {
  return findTrackedGame(data, appId)?.iconUrl;
}

type ShelfEntry = { game: SteamGame; source: 'recent' | 'all-time' };

/** A recent entry is here *because* of when it was played, so it says when; an all-time filler is
 * here because of how much, so it says how much. Recent entries fall back to hours if Steam never
 * reported an rtime_last_played for the app. */
function shelfMeta(entry: ShelfEntry): string | undefined {
  if (entry.source === 'all-time') {
    return entry.game.playtimeForeverMinutes === undefined
      ? undefined
      : `${formatHours(entry.game.playtimeForeverMinutes)} all time`;
  }
  if (entry.game.lastPlayedAt) return relativeTime(entry.game.lastPlayedAt);
  return entry.game.playtimeRecentMinutes === undefined
    ? undefined
    : `${formatHours(entry.game.playtimeRecentMinutes)} recent`;
}

function ShelfGame({ entry }: Readonly<{ entry: ShelfEntry }>) {
  const meta = shelfMeta(entry);
  const art = useArtFallback([entry.game.headerUrl, entry.game.heroUrl]);
  const hasHeader = Boolean(art.src);
  return (
    <article className="steam-shelf-game">
      {hasHeader ? (
        <img aria-hidden src={art.src} alt="" loading="lazy" onError={art.onError} />
      ) : (
        <div className="steam-shelf-game-fallback" />
      )}
      <div className="steam-shelf-game-scrim" />
      <div className="steam-shelf-game-copy">
        <p className="truncate text-sm font-semibold text-white">{entry.game.name}</p>
        {meta && <p className="mt-0.5 text-[10px] tabular-nums text-white/70">{meta}</p>}
      </div>
    </article>
  );
}

function SteamHomeDashboard({ data }: Readonly<{ data: SteamData }>) {
  if (data.availability.library !== 'available' || !data.library) return null;

  // Deliberately last-played order, not most-played (the server sorts it that way in orderByRecency)
  // — an hours-ranked shelf can sit unchanged for a whole 2-week window no matter how much gets
  // played, so the card would stop reflecting the evening. The heading below says so rather than
  // claiming a ranking this isn't.
  const recentGames = data.recentlyPlayed;
  const recentIds = new Set(recentGames.map((game) => game.appId));
  const shelf: ShelfEntry[] = [
    ...recentGames.map((game) => ({ game, source: 'recent' as const })),
    ...data.library.mostPlayed.filter((game) => !recentIds.has(game.appId)).map((game) => ({ game, source: 'all-time' as const })),
  ].slice(0, 3);
  // The shelf pads with all-time most-played when fewer than 3 games have been touched in Steam's
  // 2-week window, so neither line can be hardcoded — a padded shelf headed "Last played" would be
  // naming games that haven't been played in months.
  const hasRecent = shelf.some((entry) => entry.source === 'recent');
  const hasAllTime = shelf.some((entry) => entry.source === 'all-time');
  let shelfHeading = 'Most played';
  let shelfWindow = 'All time';
  if (hasRecent) {
    shelfHeading = 'Last played';
    shelfWindow = hasAllTime ? 'Recent + all-time' : 'Last 2 weeks';
  }
  const { totalGames, totalPlaytimeMinutes, recentPlaytimeMinutes } = data.library;
  const achievementPct = data.achievements && data.achievements.totalCount > 0
    ? Math.round((data.achievements.unlockedCount / data.achievements.totalCount) * 100)
    : undefined;
  const recentUnlocks = data.achievements?.recentUnlocks.slice(0, 3) ?? [];
  const trackedGameIcon = data.achievements ? findTrackedGameIcon(data, data.achievements.appId) : undefined;

  return (
    <div className="steam-home-dashboard">
      <section className="steam-pulse" aria-label="Steam library summary">
        {data.achievements && achievementPct !== undefined && (
          <div className="steam-pulse-top">
            <AchievementRing pct={achievementPct} iconUrl={trackedGameIcon} />
            <div className="steam-pulse-top-copy">
              <span className="steam-eyebrow">Achievement progress</span>
              <p className="steam-pulse-game">{data.achievements.gameName}</p>
            </div>
            <p className="steam-pulse-pct">{achievementPct}%</p>
          </div>
        )}

        {recentUnlocks.length > 0 && (
          <ul className="steam-pulse-badges" aria-label="Latest achievements">
            {recentUnlocks.map((achievement) => <AchievementBadge key={achievement.apiName} achievement={achievement} />)}
          </ul>
        )}

        <div className="steam-pulse-stats">
          <div className="steam-pulse-stat">
            <p className="steam-pulse-stat-value">{totalGames}</p>
            <p className="steam-pulse-stat-label">games owned</p>
          </div>
          <div className="steam-pulse-stat">
            <p className="steam-pulse-stat-value">{formatHours(totalPlaytimeMinutes)}</p>
            <p className="steam-pulse-stat-label">hours played</p>
          </div>
          <div className="steam-pulse-stat">
            <p className="steam-pulse-stat-value">{recentPlaytimeMinutes > 0 ? formatHours(recentPlaytimeMinutes) : '—'}</p>
            <p className="steam-pulse-stat-label">past 2 weeks</p>
          </div>
        </div>
      </section>

      {shelf.length > 0 && (
        <section className="steam-home-shelf" aria-label={`${shelfHeading} Steam games`}>
          <div className="steam-home-section-heading">
            <p>{shelfHeading}</p>
            <span>{shelfWindow}</span>
          </div>
          <div className="steam-shelf-grid">
            {shelf.map((entry) => <ShelfGame key={entry.game.appId} entry={entry} />)}
          </div>
        </section>
      )}
    </div>
  );
}

export function SteamOverview() {
  const { envelope, offline } = useWidget<SteamData>('steam');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => <SteamOverviewContent data={data} />}
    </WidgetBody>
  );
}

function SteamOverviewContent({ data }: Readonly<{ data: SteamData }>) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const recent = data.recentlyPlayed[0];
  const featured = data.currentGame ?? recent ?? data.library?.mostPlayed[0];
  let featuredLabel: string | undefined;
  if (data.currentGame) featuredLabel = 'Playing now';
  else if (recent) featuredLabel = 'Recently played';
  else if (data.library?.mostPlayed[0]) featuredLabel = 'Most played';

  useEffect(() => {
    const card = overviewRef.current?.closest<HTMLElement>('.dashboard-section-card--steam');
    if (!card) return undefined;
    // Steam's header.jpg 404s for apps registered after its asset-pipeline migration (see
    // steamHeroUrl on the server) — probe candidates in order and fall through on error, same as
    // every other art spot on this widget. A bare CSS url() with no onload/onerror hook would
    // otherwise leave a 404'd header silently unset, hard to distinguish from "no art yet".
    const candidates = [featured?.headerUrl, featured?.heroUrl].filter((url): url is string => Boolean(url));
    if (candidates.length === 0) {
      card.style.removeProperty('--steam-card-art');
      return undefined;
    }
    let cancelled = false;
    let probe: HTMLImageElement | undefined;
    const tryNext = (index: number) => {
      if (cancelled) return;
      if (index >= candidates.length) {
        card.style.removeProperty('--steam-card-art');
        return;
      }
      probe = new Image();
      probe.onload = () => card.style.setProperty('--steam-card-art', `url("${candidates[index]}")`);
      probe.onerror = () => tryNext(index + 1);
      probe.src = candidates[index];
    };
    tryNext(0);
    return () => {
      cancelled = true;
      if (probe) probe.onload = probe.onerror = null;
      card.style.removeProperty('--steam-card-art');
    };
  }, [featured?.headerUrl, featured?.heroUrl]);

  return (
    <div ref={overviewRef} className="steam-overview space-y-4">
      {featuredLabel && <span className="steam-eyebrow -mt-3 mb-1">{featuredLabel}</span>}
      <SteamHomeDashboard data={data} />
    </div>
  );
}
