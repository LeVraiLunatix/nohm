import type { SpotifyData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import './spotify.css';

type Track = SpotifyData['topTracks']['shortTerm'][number];
type Artist = SpotifyData['topArtists']['shortTerm'][number];

const accent = 'var(--color-accent-spotify)';

/* The whole section card is one link, so these tiles are display-only —
   nested anchors would be invalid inside SectionCard's <a>. */

function ArtistTile({ artist, rank }: Readonly<{ artist: Artist; rank: number }>) {
  return (
    <figure className="relative aspect-square overflow-hidden rounded-2xl bg-track">
      {artist.imageUrl ? (
        <img
          src={artist.imageUrl}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-3xl font-semibold text-ink-faint">
          {artist.name.charAt(0)}
        </div>
      )}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/75 to-transparent" />
      <span className="absolute left-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-black/55 px-1 text-[11px] font-semibold tabular-nums text-white">
        {rank}
      </span>
      <figcaption className="absolute inset-x-0 bottom-0 truncate px-2.5 pb-2 text-sm font-semibold text-white">
        {artist.name}
      </figcaption>
    </figure>
  );
}

function TopSong({ track }: Readonly<{ track: Track }>) {
  const year = track.releaseDate?.slice(0, 4);
  return (
    <div
      className="flex h-full min-h-44 items-stretch gap-4 overflow-hidden rounded-2xl border border-card-border p-4"
      style={{ background: `color-mix(in oklab, ${accent} 9%, var(--color-card))` }}
    >
      {track.imageUrl ? (
        <img
          src={track.imageUrl}
          alt=""
          className="aspect-square w-28 shrink-0 self-center rounded-xl object-cover shadow-lg sm:w-36"
        />
      ) : (
        <div className="aspect-square w-28 shrink-0 self-center rounded-xl bg-track sm:w-36" />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
          Top song · 4 weeks
        </p>
        <p className="mt-1 truncate text-lg font-semibold text-ink">{track.track}</p>
        <p className="truncate text-sm text-ink-muted">{track.artist}</p>
        {year && <p className="mt-0.5 text-xs text-ink-faint">{year}</p>}
      </div>
    </div>
  );
}

export function SpotifyOverview() {
  const { envelope, offline } = useWidget<SpotifyData>('spotify');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => {
        const artists = data.topArtists.shortTerm.slice(0, 3);
        const topTrack = data.topTracks.shortTerm[0];
        if (artists.length === 0 && !topTrack) {
          return <p className="text-sm text-ink-faint">No listening data yet.</p>;
        }
        return (
          <div className="grid gap-3 lg:grid-cols-2 lg:items-center">
            {artists.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  Top artists · 4 weeks
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {artists.map((artist, i) => (
                    <ArtistTile key={artist.name} artist={artist} rank={i + 1} />
                  ))}
                </div>
              </div>
            )}
            {topTrack && <TopSong track={topTrack} />}
          </div>
        );
      }}
    </WidgetBody>
  );
}
