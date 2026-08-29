import type { MusicData } from '@nohm/shared';
import { WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { useI18n } from '../../i18n/I18nProvider';
import { useWidget } from '../../useWidget';

export function LastFmPanel() {
  const { t, date, number } = useI18n();
  const widget = useWidget<MusicData>('music-lastfm');
  return (
    <WidgetShell title="Last.fm">
      <WidgetBody envelope={widget.envelope} offline={widget.offline}>
        {(data) => (
          <div className="lastfm-grid">
            <section className="lastfm-history">
              <h2>{t('music.history')}</h2>
              <ol>
                {data.history.slice(0, 12).map((item, index) => (
                  <li key={`${item.track.url ?? item.track.title}-${item.playedAt ?? index}`}>
                    <span>{item.track.title}<small>{item.track.artist}</small></span>
                    <time>{item.nowPlaying ? t('music.nowPlaying') : item.playedAt ? date(item.playedAt, { hour: '2-digit', minute: '2-digit' }) : '—'}</time>
                  </li>
                ))}
              </ol>
            </section>
            <div className="lastfm-stats">
              {([
                ['music.topArtists', data.statistics?.topArtists],
                ['music.topTracks', data.statistics?.topTracks],
                ['music.topAlbums', data.statistics?.topAlbums],
              ] as const).map(([title, items]) => (
                <section key={title}>
                  <h2>{t(title)}</h2>
                  <ol>{(items ?? []).slice(0, 5).map((item) => <li key={item.label}><span>{item.label}</span><small>{t('music.plays', { count: number(item.playCount) })}</small></li>)}</ol>
                </section>
              ))}
            </div>
            {data.favorites.length > 0 && <section className="lastfm-favorites"><h2>{t('music.favorites')}</h2><div>{data.favorites.slice(0, 8).map((track) => <span key={`${track.artist}-${track.title}`}>{track.title}<small>{track.artist}</small></span>)}</div></section>}
          </div>
        )}
      </WidgetBody>
    </WidgetShell>
  );
}
