import { useState } from 'react';
import type { MusicData, WidgetEnvelope } from '@nohm/shared';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { useI18n } from '../../i18n/I18nProvider';

function MusicButton({ label, disabled, onClick, children }: Readonly<{ label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }>) {
  return <button type="button" className="music-control" aria-label={label} title={label} disabled={disabled} onClick={onClick}>{children}</button>;
}

const Icon = {
  shuffle: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h3.5c1.6 0 2.5.9 3.6 2.4M20 6h-3.6c-2.9 0-4 3-6.4 6.4S6.6 18 3.7 18" />
      <path d="M4 18h3.5c1.6 0 2.5-.9 3.6-2.4" /><path d="M17 3l3 3-3 3M17 21l3-3-3-3" />
    </svg>
  ),
  previous: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14a1 1 0 0 0 2 0v-5.2l9.5 5.9A1 1 0 0 0 20 19V5a1 1 0 0 0-1.5-.8L9 10V5a1 1 0 0 0-2 0Z" /></svg>
  ),
  next: (
    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 5v14a1 1 0 0 1-2 0v-5.2L5.5 19.7A1 1 0 0 1 4 19V5a1 1 0 0 1 1.5-.8L15 10V5a1 1 0 0 1 2 0Z" /></svg>
  ),
  play: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.9l11-6.8a1 1 0 0 0 0-1.7l-11-6.8A1 1 0 0 0 8 5.2Z" /></svg>,
  pause: <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2" /><rect x="14" y="5" width="4" height="14" rx="1.2" /></svg>,
  repeat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12V9a4 4 0 0 1 4-4h9M4 12l3-3M4 12l3 3" transform="translate(0 -1)" />
      <path d="M20 13v2a4 4 0 0 1-4 4H7M20 15l-3 3M20 15l-3-3" transform="translate(0 -1)" />
    </svg>
  ),
} as const;

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
