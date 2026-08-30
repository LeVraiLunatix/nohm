import { useState } from 'react';
import type { MusicData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { useI18n } from '../../i18n/I18nProvider';
import { SpotifyOverview } from '../spotify/SpotifyOverview';
import { useMusicProvider } from '../settings/preferences';
import { MusicIcon } from './icons';
import './music.css';

/** The overview card follows the music provider chosen in Settings. */
export function MusicOverview() {
  const provider = useMusicProvider();
  if (provider === 'spotify') return <SpotifyOverview />;
  return provider === 'lastfm'
    ? <NowPlaying id="music-lastfm" label="Last.fm" controllable={false} />
    : <NowPlaying id="music-cider" label="Cider" controllable />;
}

function NowPlaying({ id, label, controllable }: Readonly<{ id: string; label: string; controllable: boolean }>) {
  const { t } = useI18n();
  const { envelope, refetch } = useWidget<MusicData>(id);
  const [pending, setPending] = useState(false);
  const data = envelope?.data;
  const track = data?.track;

  const command = async (name: string) => {
    setPending(true);
    try {
      await fetch('/api/music/cider/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: name }) });
      refetch();
    } finally {
      setPending(false);
    }
  };

  const pct = track?.durationMs && data?.positionMs != null
    ? Math.min(100, Math.max(0, (data.positionMs / track.durationMs) * 100))
    : null;

  return (
    <div className="music-now">
      <div className="music-now-cover">
        {track?.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <span aria-hidden>♪</span>}
      </div>
      <div className="music-now-main">
        <p className="music-now-label">{label}{data?.device ? ` · ${data.device}` : ''}</p>
        {track ? (
          <>
            <strong className="music-now-title">{track.title}</strong>
            <span className="music-now-artist">{track.artist}{track.album ? ` · ${track.album}` : ''}</span>
          </>
        ) : (
          <span className="music-now-artist">{t('music.noTrack')}</span>
        )}
        {pct !== null && <span className="music-now-bar" aria-hidden><span style={{ width: `${pct}%` }} /></span>}
        {controllable && track && (
          <div className="music-now-controls">
            <button type="button" aria-label={t('music.previous')} disabled={pending || data?.capabilities.previous === false} onClick={() => void command('previous')}>{MusicIcon.previous}</button>
            <button type="button" aria-label={data?.playing ? t('music.pause') : t('music.play')} disabled={pending} onClick={() => void command(data?.playing ? 'pause' : 'play')}>{data?.playing ? MusicIcon.pause : MusicIcon.play}</button>
            <button type="button" aria-label={t('music.next')} disabled={pending || data?.capabilities.next === false} onClick={() => void command('next')}>{MusicIcon.next}</button>
          </div>
        )}
      </div>
    </div>
  );
}
