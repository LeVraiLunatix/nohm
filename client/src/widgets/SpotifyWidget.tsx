import { useEffect, useState } from 'react';
import type { CommandCenterSlot, SpotifyData } from '@nohm/shared';
import { useWidget } from '../useWidget';
import { StaleBadge, WidgetBody, WidgetShell } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';

type Range = 'shortTerm' | 'mediumTerm' | 'longTerm' | 'allTime';
const RANGE_LABEL: Record<Range, string> = { shortTerm: '4 weeks', mediumTerm: '6 months', longTerm: '12 months', allTime: 'All time' };

type Track = SpotifyData['topTracks']['shortTerm'][number] & { playCount?: number };
type Artist = SpotifyData['topArtists']['shortTerm'][number] & { playCount?: number };
type Album = SpotifyData['allTime']['albums'][number];

function tracksForRange(data: SpotifyData, range: Range): Track[] {
  return range === 'allTime' ? data.allTime.tracks : data.topTracks[range];
}

function artistsForRange(data: SpotifyData, range: Range): Artist[] {
  return range === 'allTime' ? data.allTime.artists : data.topArtists[range];
}

const linkClass = 'block truncate font-medium text-ink hover:underline';
const accent = 'var(--color-accent-spotify)';

function releaseYear(releaseDate?: string): string | undefined {
  return releaseDate?.slice(0, 4);
}

function formatClock(ms?: number | null): string | undefined {
  if (ms == null || !Number.isFinite(ms)) return undefined;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Resolves the artwork for any Spotify command-center render type, so hero/secondary/tile all
 * show the same art for the same slot instead of each re-implementing the lookup. */
export function spotifyArtFor(
  render: Extract<CommandCenterSlot['render'], { type: 'spotify-now-playing' | 'spotify-track' | 'spotify-artist' | 'spotify-album' }>,
  spotify: SpotifyData | undefined,
): string | undefined {
  if (render.type === 'spotify-now-playing') return spotify?.nowPlaying?.imageUrl;
  if (render.type === 'spotify-track') {
    return [...spotify?.topTracks.shortTerm ?? [], ...spotify?.topTracks.mediumTerm ?? [], ...spotify?.topTracks.longTerm ?? [], ...spotify?.allTime.tracks ?? [], ...spotify?.recentlyPlayed ?? []]
      .find((item) => (item.id ?? item.track) === render.trackId)?.imageUrl;
  }
  if (render.type === 'spotify-artist') {
    return [...spotify?.topArtists.shortTerm ?? [], ...spotify?.topArtists.mediumTerm ?? [], ...spotify?.topArtists.longTerm ?? [], ...spotify?.allTime.artists ?? []]
      .find((a) => (a.id ?? a.name) === render.artistId)?.imageUrl;
  }
  return spotify?.allTime.albums.find((a) => (a.id ?? a.name) === render.albumId)?.imageUrl;
}

export function Thumb({ url, size = 'h-10 w-10' }: { url?: string; size?: string }) {
  return url ? (
    <img src={url} alt="" className={`${size} shrink-0 rounded-md object-cover`} />
  ) : (
    <div className={`${size} shrink-0 rounded-md bg-track`} />
  );
}

function Rank({ n }: Readonly<{ n: number }>) {
  return <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-faint">{n}</span>;
}

function TrackRow({ track, rank }: Readonly<{ track: Track; rank: number }>) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 transition hover:bg-track/45">
      <Rank n={rank} />
      <Thumb url={track.imageUrl} />
      <div className="min-w-0">
        {track.url ? (
          <a href={track.url} target="_blank" rel="noreferrer" className={linkClass}>
            {track.track}
          </a>
        ) : (
          <span className="truncate font-medium">{track.track}</span>
        )}
        <p className="truncate text-xs text-ink-faint">{track.artist}</p>
      </div>
      {track.verified && track.playCount !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-ink-faint">{track.playCount}×</span>
      )}
    </li>
  );
}

// ── Now playing ────────────────────────────────────────────────────────────

export function NowPlaying({
  nowPlaying,
  fetchedAt,
  className,
  artworkClassName,
}: Readonly<{
  nowPlaying: SpotifyData['nowPlaying'];
  fetchedAt?: string;
  className?: string;
  artworkClassName?: string;
}>) {
  const isPlaying = nowPlaying?.isPlaying ?? false;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [isPlaying]);

  if (!nowPlaying) {
    return <p className="text-sm text-ink-muted">Nothing playing right now.</p>;
  }

  // Estimate progress between polls by advancing from the server's last sampled position —
  // otherwise the bar only jumps once per poll instead of moving continuously.
  const elapsedSinceFetch = isPlaying && fetchedAt ? Math.max(0, now - Date.parse(fetchedAt)) : 0;
  const estimatedProgressMs =
    nowPlaying.progressMs != null
      ? Math.min(nowPlaying.progressMs + elapsedSinceFetch, nowPlaying.durationMs ?? Infinity)
      : null;
  const pct =
    nowPlaying.durationMs && estimatedProgressMs != null
      ? Math.min(100, (estimatedProgressMs / nowPlaying.durationMs) * 100)
      : null;
  const hasFinished = isPlaying && nowPlaying.durationMs != null && estimatedProgressMs != null
    && estimatedProgressMs >= nowPlaying.durationMs;
  const year = releaseYear(nowPlaying.releaseDate);

  if (hasFinished) {
    return <p className="text-sm text-ink-muted">Nothing playing right now.</p>;
  }

  return (
    <div className={`flex gap-4 ${className ?? ''}`}>
      {nowPlaying.imageUrl && (
        <img
          src={nowPlaying.imageUrl}
          alt=""
          className={`h-20 w-20 shrink-0 rounded-xl object-cover shadow-lg ${artworkClassName ?? ''}`}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="mb-1 flex items-center gap-2">
          <span className={`spotify-eq ${nowPlaying.isPlaying ? 'spotify-eq--on' : ''}`} aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
            {nowPlaying.isPlaying ? 'Playing' : 'Paused'}
          </span>
        </div>
        {nowPlaying.url ? (
          <a href={nowPlaying.url} target="_blank" rel="noreferrer" className="truncate text-base font-semibold text-ink hover:underline">
            {nowPlaying.track}
          </a>
        ) : (
          <p className="truncate text-base font-semibold">{nowPlaying.track}</p>
        )}
        <p className="truncate text-sm text-ink-muted">
          {nowPlaying.artist}
          {nowPlaying.album ? ` · ${nowPlaying.album}` : ''}
          {year ? ` · ${year}` : ''}
        </p>
        {pct !== null && (
          <>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-track">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: accent, transition: 'width 500ms linear' }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-faint">
              <span>{formatClock(estimatedProgressMs)}</span>
              <span>{formatClock(nowPlaying.durationMs)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function NowPlayingWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  return (
    <WidgetShell title="Now playing" badge={<StaleBadge envelope={envelope} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => <NowPlaying nowPlaying={data.nowPlaying} fetchedAt={envelope?.fetchedAt} />}
      </WidgetBody>
    </WidgetShell>
  );
}

// ── Time-range toggle ───────────────────────────────────────────────────────

function RangeToggle({ range, onChange }: Readonly<{ range: Range; onChange: (r: Range) => void }>) {
  return (
    <fieldset className="spotify-range-toggle" aria-label="Time range">
      {(['shortTerm', 'mediumTerm', 'longTerm', 'allTime'] as Range[]).map((r) => (
        <button key={r} type="button" data-active={r === range} onClick={() => onChange(r)}>
          {RANGE_LABEL[r]}
        </button>
      ))}
    </fieldset>
  );
}

// ── Top artists (grid) + featured #1 track ─────────────────────────────────

function FeaturedTrack({ track, label }: { track: Track; label: string }) {
  const year = releaseYear(track.releaseDate);
  const duration = formatClock(track.durationMs);
  const meta = [track.artist, year, duration].filter(Boolean).join(' · ');
  const content = (
    <>
      <Thumb url={track.imageUrl} size="h-16 w-16 sm:h-20 sm:w-20" />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
          Your #1 track · {label}
        </p>
        <p className="mt-0.5 truncate text-base font-semibold text-ink">{track.track}</p>
        <p className="truncate text-sm text-ink-muted">{meta}</p>
      </div>
    </>
  );
  const className =
    'col-span-full flex items-center gap-4 rounded-2xl border border-card-border p-3 transition hover:border-white/15 sm:p-4';
  const style = { background: `color-mix(in oklab, ${accent} 10%, var(--color-card))` };
  return track.url ? (
    <a href={track.url} target="_blank" rel="noreferrer" className={`${className} group`} style={style}>
      {content}
    </a>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}

function ArtistCell({ artist, rank }: { artist: Artist; rank: number }) {
  const inner = (
    <>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-track">
        {artist.imageUrl && (
          <img
            src={artist.imageUrl}
            alt=""
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 text-xs font-medium tabular-nums text-white">
          {rank}
        </span>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium text-ink">{artist.name}</p>
      {artist.genres[0] && <p className="truncate text-xs text-ink-faint">{artist.genres[0]}</p>}
    </>
  );
  return artist.url ? (
    <a href={artist.url} target="_blank" rel="noreferrer" className="group block">
      {inner}
    </a>
  ) : (
    <div className="group block">{inner}</div>
  );
}

export function TopArtistsWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  const [range, setRange] = useState<Range>('shortTerm');
  return (
    <WidgetShell title="Top artists" badge={<RangeToggle range={range} onChange={setRange} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => {
          const artists = artistsForRange(data, range).slice(0, 8);
          const topTrack = tracksForRange(data, range)[0];
          if (artists.length === 0 && !topTrack) {
            return <p className="text-sm text-ink-faint">No data yet.</p>;
          }
          return (
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
              {topTrack && <FeaturedTrack track={topTrack} label={RANGE_LABEL[range]} />}
              {artists.map((artist, i) => (
                <ArtistCell key={`${artist.name}-${i}`} artist={artist} rank={i + 1} />
              ))}
            </div>
          );
        }}
      </WidgetBody>
    </WidgetShell>
  );
}

// ── Top tracks (up to 50, scrollable) ──────────────────────────────────────

export function TopTracksWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  const [range, setRange] = useState<Range>('shortTerm');
  return (
    <WidgetShell title="Top tracks" badge={<RangeToggle range={range} onChange={setRange} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => {
          const tracks = tracksForRange(data, range);
          if (tracks.length === 0) return <p className="text-sm text-ink-faint">No data yet.</p>;
          return (
            <ol className="max-h-[34rem] space-y-2 overflow-y-auto pr-1 text-sm">
              {tracks.map((track, i) => (
                <TrackRow key={`${track.track}-${i}`} track={track} rank={i + 1} />
              ))}
            </ol>
          );
        }}
      </WidgetBody>
    </WidgetShell>
  );
}

// ── Recently played (up to 50, scrollable) ─────────────────────────────────

export function RecentlyPlayedWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  return (
    <WidgetShell title="Recently played" badge={<StaleBadge envelope={envelope} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.recentlyPlayed.length === 0 ? (
            <p className="text-sm text-ink-faint">No recent listening.</p>
          ) : (
            <ul className="max-h-[34rem] space-y-2 overflow-y-auto pr-1 text-sm">
              {data.recentlyPlayed.map((track, i) => (
                <li key={`${track.playedAt}-${i}`} className="flex items-center gap-3 rounded-xl bg-track/25 px-3 py-2 transition hover:bg-track/45">
                  <Thumb url={track.imageUrl} />
                  <div className="min-w-0 flex-1">
                    {track.url ? (
                      <a href={track.url} target="_blank" rel="noreferrer" className={linkClass}>
                        {track.track}
                      </a>
                    ) : (
                      <span className="truncate font-medium">{track.track}</span>
                    )}
                    <p className="truncate text-xs text-ink-faint">{track.artist}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint">{relativeTime(track.playedAt)}</span>
                </li>
              ))}
            </ul>
          )
        }
      </WidgetBody>
    </WidgetShell>
  );
}

// ── Top albums (all-time only — Spotify has no top-albums endpoint) ────────

function formatReleaseDate(album: Album): string | undefined {
  if (!album.releaseDate) return undefined;
  if (album.releaseDatePrecision === 'day') {
    return new Date(album.releaseDate).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  if (album.releaseDatePrecision === 'month') {
    const [year, month] = album.releaseDate.split('-').map(Number);
    return new Date(year, month - 1).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
  }
  return album.releaseDate.slice(0, 4);
}

function formatDuration(ms?: number): string | undefined {
  if (!ms) return undefined;
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

function AlbumRow({ album, rank }: Readonly<{ album: Album; rank: number }>) {
  const meta = [
    formatReleaseDate(album),
    album.totalTracks ? `${album.totalTracks} tracks` : undefined,
    formatDuration(album.totalDurationMs),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex items-stretch gap-3 overflow-hidden rounded-r-2xl border border-card-border bg-track/25 transition hover:bg-track/45">
      <div className="relative w-20 shrink-0 sm:w-24">
        {album.imageUrl ? (
          <img src={album.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-track" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 text-xs font-medium tabular-nums text-white">
          {rank}
        </span>
      </div>
      <div className="min-w-0 flex-1 py-2.5 pr-1">
        {album.url ? (
          <a href={album.url} target="_blank" rel="noreferrer" className={linkClass}>
            {album.name}
          </a>
        ) : (
          <span className="block truncate font-medium">{album.name}</span>
        )}
        <p className="truncate text-xs text-ink-faint">{album.artist}</p>
        {meta && <p className="mt-0.5 truncate text-[11px] text-ink-faint">{meta}</p>}
      </div>
      {album.topTracks.length > 0 && (
        <div className="hidden w-48 shrink-0 border-l border-card-border/60 py-2.5 pl-3 pr-3 sm:block sm:w-64">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Top tracks</p>
          <ol className="mt-1 space-y-0.5 text-xs text-ink-muted">
            {album.topTracks.map((track, i) => (
              <li key={track.id ?? `${track.track}-${i}`} className="truncate">
                {i + 1}. {track.track}
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

export function TopAlbumsWidget() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');
  return (
    <WidgetShell title="Top albums" badge={<StaleBadge envelope={envelope} />}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => {
          const albums = data.allTime.albums.slice(0, 10);
          if (albums.length === 0) {
            return <p className="text-sm text-ink-faint">No album data yet — builds up as you listen.</p>;
          }
          return (
            <ol className="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {albums.map((album, i) => (
                <AlbumRow key={album.id ?? `${album.name}-${i}`} album={album} rank={i + 1} />
              ))}
            </ol>
          );
        }}
      </WidgetBody>
    </WidgetShell>
  );
}
