import type { SteamData } from '@nohm/shared';
import { formatHours, useArtFallback } from './shared';
import { SteamLibraryStats } from './library';

/** The "Steam activity" intro's hero band — profile, tracked game, and library stats on the left,
 * the tracked game's header art bleeding edge-to-edge on the right (no inset padding, so it reads
 * as a poster panel rather than a thumbnail). Padding lives on the copy column only; the art side
 * has none, letting it touch the card's top/right/bottom edges. */
export function SteamActivityHero({ data }: Readonly<{ data: SteamData }>) {
  // Steam orders GetRecentlyPlayedGames by recency itself, not by playtime — trust that order
  // rather than re-ranking by playtimeRecentMinutes (that biased toward "most played," not "most
  // recent"). The last-2-weeks window still means a big library with no play in that window would
  // otherwise show a blank card, hence the library fallback.
  const recent = data.recentlyPlayed[0];
  const game = data.currentGame ?? recent ?? data.library?.mostPlayed[0];
  const art = useArtFallback([game?.headerUrl, game?.heroUrl]);
  const hasArt = Boolean(art.src);
  let label: string | undefined;
  if (data.currentGame) label = 'Playing now';
  else if (recent) label = 'Recently played';
  else if (game) label = 'Most played';

  return (
    <div className="detail-signal-panel steam-signal-panel">
      {hasArt && (
        <img aria-hidden src={art.src} alt="" className="steam-signal-backdrop" />
      )}
      <div aria-hidden className="steam-signal-backdrop-scrim" />
      <div className="steam-signal-body">
        <div className="steam-signal-copy">
          <div className="flex items-center gap-3">
            {data.profile.avatarUrl ? (
              <img src={data.profile.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-full bg-track" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{data.profile.personaName}</p>
              <a
                href={data.profile.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xs text-ink-faint hover:underline"
              >
                View Steam profile
              </a>
            </div>
          </div>

          {game ? (
            <div>
              <div className="flex items-center gap-2">
                {data.currentGame && <span aria-hidden className="steam-live-dot" />}
                {label && <span className="steam-eyebrow">{label}</span>}
              </div>
              <p className="mt-1 truncate text-xl font-semibold tracking-[-0.02em] text-ink">{game.name}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
                {game.playtimeForeverMinutes !== undefined && <span>{formatHours(game.playtimeForeverMinutes)} in library</span>}
                {game.playtimeRecentMinutes !== undefined && game.playtimeRecentMinutes > 0 && (
                  <span className="text-ink">{formatHours(game.playtimeRecentMinutes)} this fortnight</span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-faint">No recent Steam activity.</p>
          )}

          <SteamLibraryStats data={data} />
        </div>

        {game && (
          <div className="steam-signal-art">
            {hasArt ? (
              <img src={art.src} alt="" className="steam-signal-art-img" onError={art.onError} />
            ) : (
              <div aria-hidden className="steam-signal-art-img steam-signal-art-fallback" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
