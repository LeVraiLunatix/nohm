import type { MusicData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { SpotifyOverview } from '../spotify/SpotifyOverview';
import { useMusicProvider } from '../settings/preferences';

/** The overview card follows the music provider chosen in Settings. */
export function MusicOverview() {
  const provider = useMusicProvider();
  if (provider === 'spotify') return <SpotifyOverview />;
  return provider === 'lastfm'
    ? <EnvelopeNowPlaying id="music-lastfm" label="Last.fm" />
    : <EnvelopeNowPlaying id="music-cider" label="Cider" />;
}

function EnvelopeNowPlaying({ id, label }: Readonly<{ id: string; label: string }>) {
  const { envelope } = useWidget<MusicData>(id);
  const track = envelope?.data?.track;
  return (
    <div className="music-overview">
      <p className="text-xs uppercase tracking-[.16em] text-ink-faint">{label}</p>
      {track
        ? <><strong>{track.title}</strong><span>{track.artist}</span></>
        : <span className="text-ink-faint">—</span>}
    </div>
  );
}
