import { useState } from 'react';
import type { MusicData, WidgetEnvelope } from '@nohm/shared';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { useI18n } from '../../i18n/I18nProvider';
import { MusicIcon as Icon } from './icons';

function MusicButton({ label, disabled, onClick, children }: Readonly<{ label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }>) {
  return <button type="button" className="music-control" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

export function MusicPlayer({ envelope, offline, onUpdated }: Readonly<{ envelope: WidgetEnvelope<MusicData> | null; offline: boolean; onUpdated: (envelope: WidgetEnvelope<MusicData>) => void }>) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const command = async (name: string, value?: number) => {
    setPending(true);
    try {
      const response = await fetch('/api/music/cider/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: name, ...(value === undefined ? {} : { value }) }) });
      if (response.ok) onUpdated(await response.json());
    } finally { setPending(false); }
  };

  return (
    <WidgetShell title={t('music.nowPlaying')}>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => {
          const track = data.track;
          const duration = track?.durationMs ?? 0;
          const position = Math.min(data.positionMs ?? 0, duration || Number.MAX_SAFE_INTEGER);
          return (
            <div className="music-player">
              <div className="music-artwork">{track?.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <span aria-hidden>N</span>}</div>
              <div className="music-player-main">
                <div className="music-provider-line"><span>{data.providerLabel}</span><span>{data.device}</span></div>
                {track ? <div><h2>{track.title}</h2><p>{track.artist}{track.album ? ` · ${track.album}` : ''}</p></div> : <p>{t('music.noTrack')}</p>}
                <input className="music-progress" type="range" min="0" max={Math.max(duration, 1)} value={position} disabled={!data.capabilities.seek || !track} aria-label="Position" onChange={(event) => void command('seek', Number(event.target.value) / 1000)} />
                <div className="music-controls">
                  <MusicButton label={t('music.shuffle')} disabled={!data.capabilities.shuffle || pending} onClick={() => void command('toggle-shuffle')}>{Icon.shuffle}</MusicButton>
                  <MusicButton label={t('music.previous')} disabled={!data.capabilities.previous || pending} onClick={() => void command('previous')}>{Icon.previous}</MusicButton>
                  <MusicButton label={data.playing ? t('music.pause') : t('music.play')} disabled={pending} onClick={() => void command(data.playing ? 'pause' : 'play')}>{data.playing ? Icon.pause : Icon.play}</MusicButton>
                  <MusicButton label={t('music.next')} disabled={!data.capabilities.next || pending} onClick={() => void command('next')}>{Icon.next}</MusicButton>
                  <MusicButton label={t('music.repeat')} disabled={!data.capabilities.repeat || pending} onClick={() => void command('toggle-repeat')}>{Icon.repeat}</MusicButton>
                </div>
                {data.capabilities.volume && data.volume !== undefined && <label className="music-volume"><span>{t('music.volume')}</span><input type="range" min="0" max="1" step="0.01" defaultValue={data.volume} onMouseUp={(event) => void command('volume', Number(event.currentTarget.value))} /></label>}
              </div>
              {data.capabilities.queue && data.queue.length > 0 && <aside className="music-queue"><h3>{t('music.queue')}</h3><ol>{data.queue.slice(0, 8).map((item) => <li key={`${item.index}-${item.track.id ?? item.track.title}`} className={item.current ? 'is-current' : ''}><span>{item.track.title}</span><small>{item.track.artist}</small></li>)}</ol></aside>}
            </div>
          );
        }}
      </WidgetBody>
    </WidgetShell>
  );
}
