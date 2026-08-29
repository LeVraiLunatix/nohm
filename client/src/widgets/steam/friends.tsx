import { useState, type CSSProperties } from 'react';
import type { SteamData } from '@nohm/shared';
import { formatHours } from './shared';

export function SteamFriendsWidget({ data }: Readonly<{ data: SteamData }>) {
  if (data.availability.friends !== 'available') {
    return (
      <p className="text-sm text-ink-faint">
        {data.availability.friends === 'private' ? 'Friends list is private.' : "Friends data isn't available right now."}
      </p>
    );
  }
  if (data.friendsInGame.length === 0) {
    return <p className="text-sm text-ink-faint">No friends currently in a game.</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {data.friendsInGame.map((friend) => (
        <li key={friend.steamId} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2">
          {friend.avatarUrl ? (
            <img src={friend.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="h-8 w-8 shrink-0 rounded-full bg-track" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{friend.personaName}</p>
            <p className="truncate text-xs text-ink-faint">{friend.gameName}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

type SteamLeaderboardPeriod = 'total' | 'recent';

/** Ranked by all-time or trailing-two-week playtime; friends with private libraries remain
 * visible (name only) rather than being silently dropped from the list. */
export function SteamFriendsLeaderboard({ data }: Readonly<{ data: SteamData }>) {
  const [period, setPeriod] = useState<SteamLeaderboardPeriod>('total');
  const { status, entries } = data.friendsLeaderboard;
  if (status !== 'available') {
    return <p className="text-sm text-ink-faint">Friends leaderboard isn&apos;t available right now.</p>;
  }
  if (entries.length <= 1) {
    return <p className="text-sm text-ink-faint">Add Steam friends to see a playtime leaderboard.</p>;
  }
  const metric = period === 'total' ? 'totalPlaytimeMinutes' : 'recentPlaytimeMinutes';
  const ranked = entries
    .filter((entry) => entry[metric] !== undefined)
    .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));
  const unranked = entries.filter((entry) => entry[metric] === undefined);
  const max = Math.max(...ranked.map((entry) => entry[metric] ?? 0), 1);

  return (
    <div>
      <fieldset className="steam-leaderboard-period steam-sort-toggle" aria-label="Playtime period">
        <button type="button" data-active={period === 'total'} onClick={() => setPeriod('total')}>All time</button>
        <button type="button" data-active={period === 'recent'} onClick={() => setPeriod('recent')}>Last 2 weeks</button>
      </fieldset>
      <ol className="space-y-1.5">
        {ranked.map((entry, i) => (
          <li
            key={entry.steamId}
            className="steam-leaderboard-row"
            data-you={entry.isYou}
            style={{ '--fill': `${((entry[metric] ?? 0) / max) * 100}%` } as CSSProperties}
          >
            <span className="w-4 shrink-0 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
            {entry.avatarUrl ? (
              <img src={entry.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="h-7 w-7 shrink-0 rounded-full bg-track" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {entry.isYou ? 'You' : entry.personaName}
            </span>
            {entry.sharedGames > 0 && (
              <span className="shrink-0 text-[10px] text-ink-faint">{entry.sharedGames} shared</span>
            )}
            <span className="shrink-0 text-xs tabular-nums text-ink-muted">{formatHours(entry[metric] ?? 0)}</span>
          </li>
        ))}
      </ol>
      {unranked.length > 0 && (
        <ul className="mt-3 space-y-1 opacity-50">
          {unranked.map((entry) => (
            <li key={entry.steamId} className="flex items-center gap-3 px-1 py-1 text-xs text-ink-faint">
              {entry.avatarUrl ? (
                <img src={entry.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="h-5 w-5 shrink-0 rounded-full bg-track" />
              )}
              <span className="min-w-0 flex-1 truncate">{entry.personaName}</span>
              <span className="shrink-0">library private</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
