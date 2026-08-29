import type { ReactNode } from 'react';
import type { CommandCenterSlot, SpotifyData } from '@nohm/shared';
import { NowPlaying, Thumb } from '../../../widgets/SpotifyWidget';

function formatAlbumDuration(durationMs?: number): string | undefined {
  if (!durationMs) return undefined;
  const totalMinutes = Math.round(durationMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

export function SpotifyNowPlayingSecondary({ spotify, spotifyFetchedAt }: Readonly<{ spotify: SpotifyData | undefined; spotifyFetchedAt: string | undefined }>): ReactNode {
  if (!spotify?.nowPlaying) return null;
  return <div className="mt-4"><NowPlaying nowPlaying={spotify.nowPlaying} fetchedAt={spotifyFetchedAt} className="command-secondary-spotify" artworkClassName="command-secondary-spotify-artwork" /></div>;
}

export function SpotifyTrackSecondary({ slot, spotify }: Readonly<{ slot: CommandCenterSlot; spotify: SpotifyData | undefined }>): ReactNode {
  if (slot.render.type !== 'spotify-track') return null;
  const trackId = slot.render.trackId;
  const track = [...spotify?.topTracks.shortTerm ?? [], ...spotify?.topTracks.mediumTerm ?? [], ...spotify?.topTracks.longTerm ?? [], ...spotify?.allTime.tracks ?? [], ...spotify?.recentlyPlayed ?? []]
    .find((item) => (item.id ?? item.track) === trackId);
  return <div className="command-secondary-spotify mt-4">
    <Thumb url={track?.imageUrl} size="command-secondary-track-artwork" />
    <div className="min-w-0"><p className="text-sm font-semibold text-ink">{slot.title}</p><p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p></div>
  </div>;
}

export function SpotifyArtistSecondary({ slot, spotify }: Readonly<{ slot: CommandCenterSlot; spotify: SpotifyData | undefined }>): ReactNode {
  if (slot.render.type !== 'spotify-artist') return null;
  const artistId = slot.render.artistId;
  const artist = [...spotify?.topArtists.shortTerm ?? [], ...spotify?.topArtists.mediumTerm ?? [], ...spotify?.topArtists.longTerm ?? [], ...spotify?.allTime.artists ?? []]
    .find((a) => (a.id ?? a.name) === artistId);
  const tracksByTimeframe = {
    short: spotify?.topTracks.shortTerm ?? [],
    medium: spotify?.topTracks.mediumTerm ?? [],
    long: spotify?.topTracks.longTerm ?? [],
    allTime: spotify?.allTime.tracks ?? [],
  };
  const legacyTimeframe = slot.id.split(':')[2];
  const timeframe = slot.render.timeframe ?? (legacyTimeframe in tracksByTimeframe ? legacyTimeframe as keyof typeof tracksByTimeframe : 'short');
  const tracks = tracksByTimeframe[timeframe]
    .filter((track) => track.artist.split(', ').includes(artist?.name ?? slot.title))
    .slice(0, 3);
  return <div className="command-secondary-spotify mt-4">
    {artist && <Thumb url={artist.imageUrl} size="command-secondary-artist-artwork" />}
    <div className="command-secondary-artist-details">
      <p className="text-sm font-semibold text-ink">{slot.title}</p>
      {tracks.length > 0 && <><p className="command-secondary-artist-track-label">Top tracks</p><ol className="command-secondary-artist-tracks" aria-label={`Top tracks by ${slot.title} ${timeframe}`}>
        {tracks.map((track, index) => <li key={track.id ?? track.track}><span>{index + 1}</span><p>{track.track}</p></li>)}
      </ol></>}
    </div>
  </div>;
}

export function SpotifyAlbumSecondary({ slot, spotify }: Readonly<{ slot: CommandCenterSlot; spotify: SpotifyData | undefined }>): ReactNode {
  if (slot.render.type !== 'spotify-album') return null;
  const albumId = slot.render.albumId;
  const album = spotify?.allTime.albums.find((a) => (a.id ?? a.name) === albumId);
  const albumMeta = [
    { label: 'Released', value: album?.releaseDate?.slice(0, 4) },
    { label: 'Length', value: formatAlbumDuration(album?.totalDurationMs) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
  return <div className="command-secondary-spotify mt-4">
    {album && <Thumb url={album.imageUrl} size="command-secondary-spotify-artwork" />}
    <div className="command-secondary-album-details">
      <p className="line-clamp-2 text-base font-semibold leading-tight text-ink">{slot.title}</p>
      <p className="mt-1 truncate text-sm text-ink-muted">{album?.artist.split(',')[0]?.trim() ?? slot.detail}</p>
      {albumMeta.length > 0 && <dl className="command-secondary-album-meta">
        {albumMeta.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}
      </dl>}
      {album?.totalTracks && <p className="mt-2 text-xs text-ink-faint">{album.totalTracks} tracks</p>}
    </div>
  </div>;
}
