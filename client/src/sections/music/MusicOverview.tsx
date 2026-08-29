import type { MusicData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { SpotifyOverview } from '../spotify/SpotifyOverview';

export function MusicOverview() {
  const { envelope } = useWidget<MusicData>('music-cider');
  const data = envelope?.data;
  if (!data?.track) return <SpotifyOverview />;
  return <div className="music-overview"><p className="text-xs uppercase tracking-[.16em] text-ink-faint">Cider</p><strong>{data.track.title}</strong><span>{data.track.artist}</span></div>;
}
