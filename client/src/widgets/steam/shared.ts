import { useState } from 'react';
import type { SteamData, SteamGame } from '@nohm/shared';

export const accent = 'var(--color-accent-steam)';

/** Cycles through art candidates in priority order, advancing on an `<img onError>`. Steam's
 * header.jpg 404s for apps registered after its asset-pipeline migration (see steamHeroUrl on the
 * server), so callers pass `[headerUrl, heroUrl]` (optionally more) to recover before showing no
 * art at all. Resets to the first candidate whenever the candidate set itself changes — e.g. the
 * tracked/current game switches — rather than carrying a stale failure forward onto a different
 * game; this is the "derive state during render" pattern React recommends in place of a
 * useEffect-based reset. */
export function useArtFallback(urls: ReadonlyArray<string | undefined>): {
  src: string | undefined;
  onError: () => void;
} {
  const candidates = urls.filter((url): url is string => Boolean(url));
  const key = candidates.join(' ');
  const [state, setState] = useState({ key, index: 0 });
  if (state.key !== key) {
    setState({ key, index: 0 });
    return {
      src: candidates[0],
      onError: () => setState((s) => (s.key === key && s.index === 0 ? { key, index: 1 } : s)),
    };
  }
  return {
    src: candidates[state.index],
    // A panel can render the same candidate more than once (for example, as both a poster and a
    // blurred backdrop). Only the first failure for this tier may advance the fallback; otherwise
    // the two events skip straight past the valid hero image.
    onError: () => setState((s) => (
      s.key === key && s.index === state.index ? { key, index: s.index + 1 } : s
    )),
  };
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)}h` : `${Math.round(hours)}h`;
}

/** Looks up a game (for its header/icon art) across every game list the payload already carries,
 * rather than growing the achievements payload with a duplicate field. `currentGame` is checked
 * first but never carries an `iconUrl` — GetPlayerSummaries doesn't return one — so a game that's
 * currently being played would otherwise never show its square icon even though recentlyPlayed or
 * the library has it. Keep searching past a match with no icon until one turns up, falling back to
 * the first match found (for its headerUrl/name, which every pool does populate) if none do. */
export function findTrackedGame(data: SteamData, appId: number): SteamGame | undefined {
  const pools: SteamGame[][] = [
    data.currentGame ? [data.currentGame] : [],
    data.recentlyPlayed,
    data.library?.mostPlayed ?? [],
    data.library?.allGames ?? [],
  ];
  let fallback: SteamGame | undefined;
  for (const pool of pools) {
    const match = pool.find((game) => game.appId === appId);
    if (!match) continue;
    fallback ??= match;
    if (match.iconUrl) return match;
  }
  return fallback;
}
