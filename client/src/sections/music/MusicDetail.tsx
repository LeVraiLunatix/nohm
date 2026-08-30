import { useState } from 'react';
import type { MusicData, WidgetEnvelope } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { useI18n } from '../../i18n/I18nProvider';
import { SpotifyDetail } from '../spotify/SpotifyDetail';
import { MusicPlayer } from './MusicPlayer';
import { LastFmPanel } from './LastFmPanel';
import { readMusicProvider } from '../settings/preferences';
import './music.css';

type ProviderTab = 'cider' | 'spotify' | 'lastfm' | 'apple';

export function MusicDetail() {
  const { t } = useI18n();
  const [tab, setTab] = useState<ProviderTab>(readMusicProvider);
  const widget = useWidget<MusicData>('music-cider');
  const [override, setOverride] = useState<WidgetEnvelope<MusicData> | null>(null);
  const envelope = override ?? widget.envelope;
  return (
    <div className="music-page">
      <header className="music-heading"><p>Nohm</p><h1>{t('music.title')}</h1></header>
      <nav className="music-tabs" aria-label={t('music.serviceNav')}>
        {(['cider', 'spotify', 'lastfm', 'apple'] as const).map((provider) => <button type="button" key={provider} className={tab === provider ? 'is-active' : ''} onClick={() => setTab(provider)}>{provider === 'apple' ? 'Apple Music' : provider[0]!.toUpperCase() + provider.slice(1)}</button>)}
      </nav>
      {tab === 'cider' && <><p className="music-hint">{t('music.ciderHint')}</p><MusicPlayer envelope={envelope} offline={widget.offline} onUpdated={setOverride} /></>}
      {tab === 'spotify' && <><p className="music-hint">{t('music.spotifyHint')}</p><SpotifyDetail /></>}
      {tab === 'lastfm' && <><p className="music-hint">{t('music.lastfmHint')}</p><LastFmPanel /></>}
      {tab === 'apple' && <section className="music-empty glass"><h2>Apple Music · MusicKit</h2><p>{t('music.appleHint')}</p><p className="text-xs text-ink-faint">{t('music.appleUnavailable')}</p></section>}
    </div>
  );
}
