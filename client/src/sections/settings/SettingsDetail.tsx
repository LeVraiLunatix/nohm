import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { WidgetSummary } from '@nohm/shared';
import { useI18n } from '../../i18n/I18nProvider';
import { SERVICE_CATALOG, type ServiceDefinition } from './serviceCatalog';
import { SetupWizard } from './SetupWizard';
import { SECTIONS } from '../registry';
import { readRefreshMultiplier, readVisibleSections, writeRefreshMultiplier, writeVisibleSections } from './preferences';
import { useGameMode, type GameShortcut } from '../../gameMode/GameModeProvider';

function serviceStatus(serviceIds: string[], summaries: WidgetSummary[]): 'connected' | 'offline' | 'notConfigured' {
  const matches = summaries.filter((summary) => serviceIds.includes(summary.id));
  if (matches.some((summary) => summary.status === 'ready' || summary.status === 'stale')) return 'connected';
  if (matches.some((summary) => summary.status === 'error')) return 'offline';
  return 'notConfigured';
}

export function SettingsDetail() {
  const { t, locale, setLocale } = useI18n();
  const [summaries, setSummaries] = useState<WidgetSummary[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [configured, setConfigured] = useState<string[]>([]);
  const [oauthReady, setOauthReady] = useState<string[]>([]);
  const [callbackBase, setCallbackBase] = useState('');
  const [publicUrlDraft, setPublicUrlDraft] = useState('');
  const [publicUrlState, setPublicUrlState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [editing, setEditing] = useState<ServiceDefinition | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [locating, setLocating] = useState(false);
  const [panelMsg, setPanelMsg] = useState<string | null>(null);
  const [githubCode, setGithubCode] = useState<string | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const githubAbort = useRef(false);
  const [wizard, setWizard] = useState(false);
  const [visibleSections, setVisibleSections] = useState(readVisibleSections);
  const [refreshMultiplier, setRefreshMultiplier] = useState(readRefreshMultiplier);
  const { shortcut, setShortcut } = useGameMode();
  const editingConfigured = editing ? configured.includes(editing.id) : false;

  const refreshStatus = useCallback(() => {
    void fetch('/api/widgets').then((response) => response.ok ? response.json() : { widgets: [] }).then((payload) => setSummaries(payload.widgets ?? [])).catch(() => setSummaries([]));
    void fetch('/api/settings/services').then((response) => response.ok ? response.json() : { configured: [], oauthReady: [] }).then((payload) => { setConfigured(payload.configured ?? []); setOauthReady(payload.oauthReady ?? []); setCallbackBase(payload.callbackBase ?? ''); }).catch(() => { setConfigured([]); setOauthReady([]); });
  }, []);

  const savePublicUrl = async () => {
    setPublicUrlState('saving');
    try {
      const body = publicUrlDraft.trim() ? { NOHM_PUBLIC_URL: publicUrlDraft.trim() } : {};
      const response = await fetch('/api/settings/services/general', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error('save failed');
      setPublicUrlState('saved');
      setPublicUrlDraft('');
      refreshStatus();
    } catch {
      setPublicUrlState('error');
    }
  };

  useEffect(() => {
    refreshStatus();
    // OAuth for Steam/Gmail/Spotify finishes in a separate tab; re-read status when we're focused
    // again so a just-connected service stops looking unconnected.
    const onFocus = () => refreshStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshStatus]);

  const closeEditor = () => {
    githubAbort.current = true;
    setGithubCode(null);
    setGithubBusy(false);
    setEditing(null);
  };

  const openEditor = (service: ServiceDefinition) => {
    githubAbort.current = true;
    setEditing(service);
    setValues(Object.fromEntries((service.fields ?? []).map((field) => [field.key, field.type === 'checkbox' ? '0' : ''])));
    setSaveState('idle');
    setPanelMsg(null);
    setGithubCode(null);
    setGithubBusy(false);
  };

  // GitHub device flow: ask for a code, send the user to github.com/login/device, then poll until
  // the token comes back. No PAT, no callback URL — just a one-time OAuth client id saved above.
  const connectGitHub = async () => {
    setPanelMsg(null);
    setSaveState('idle');
    setGithubBusy(true);
    githubAbort.current = false;
    try {
      const start = await fetch('/api/settings/oauth/github/device', { method: 'POST' });
      if (start.status === 409) { setPanelMsg(t('settings.githubNeedsClientId')); return; }
      if (!start.ok) throw new Error('device start failed');
      const device = await start.json() as { userCode: string; verificationUri: string; deviceCode: string; interval: number; expiresIn: number };
      setGithubCode(device.userCode);
      window.open(device.verificationUri, '_blank', 'noopener,noreferrer');
      let interval = device.interval;
      const deadline = Date.now() + device.expiresIn * 1000;
      while (Date.now() < deadline && !githubAbort.current) {
        await new Promise((resolve) => setTimeout(resolve, interval * 1000));
        if (githubAbort.current) return;
        const poll = await fetch('/api/settings/oauth/github/poll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceCode: device.deviceCode }) });
        const result = await poll.json() as { status: string; username?: string; interval?: number };
        if (result.status === 'authorized') {
          setGithubCode(null);
          setPanelMsg(t('settings.githubConnected', { name: result.username ?? '' }));
          setConfigured((current) => current.includes('github') ? current : [...current, 'github']);
          refreshStatus();
          return;
        }
        if (result.status === 'error') { setGithubCode(null); setPanelMsg(t('settings.githubFailed')); return; }
        if (result.interval) interval = result.interval;
      }
      setGithubCode(null);
      if (!githubAbort.current) setPanelMsg(t('settings.githubFailed'));
    } catch {
      setGithubCode(null);
      setPanelMsg(t('settings.githubFailed'));
    } finally {
      setGithubBusy(false);
    }
  };

  const detectMyLocation = async () => {
    if (!('geolocation' in navigator)) { setPanelMsg(t('settings.locationDenied')); return; }
    setLocating(true);
    setPanelMsg(null);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000, maximumAge: 5 * 60_000 });
      });
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const response = await fetch('/api/settings/services/weather', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ WEATHER_LAT: lat.toFixed(5), WEATHER_LON: lon.toFixed(5) }),
      });
      if (!response.ok) throw new Error('save failed');
      // Also push it to the running provider so weather refreshes now, not only after a restart.
      void fetch('/api/weather/location', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lat, lon }),
      });
      setConfigured((current) => current.includes('weather') ? current : [...current, 'weather']);
      setPanelMsg(t('settings.locationSet', { coords: `${lat.toFixed(3)}, ${lon.toFixed(3)}` }));
      refreshStatus();
    } catch {
      setPanelMsg(t('settings.locationDenied'));
    } finally {
      setLocating(false);
    }
  };

  const saveConnection = async () => {
    if (!editing) return;
    const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
    // Editing an already-connected service and nothing was typed: nothing to change.
    if (editingConfigured && Object.keys(payload).length === 0) { setEditing(null); return; }
    setSaveState('saving');
    try {
      const response = await fetch(`/api/settings/services/${encodeURIComponent(editing.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('save failed');
      setConfigured((current) => current.includes(editing.id) ? current : [...current, editing.id]);
      setValues({});
      setSaveState('saved');
      refreshStatus();
    } catch {
      setSaveState('error');
    }
  };

  const test = async (widgetId: string, serviceId: string) => {
    setTesting(serviceId);
    try {
      await fetch(`/api/widgets/${encodeURIComponent(widgetId)}/refresh`, { method: 'POST' });
      const response = await fetch('/api/widgets');
      if (response.ok) setSummaries((await response.json()).widgets ?? []);
    } finally {
      setTesting(null);
    }
  };

  // Rendered inline right under the service row it belongs to (see the service list below).
  const connectionEditor = editing ? (
    <form className="connection-panel" onSubmit={(event) => { event.preventDefault(); void saveConnection(); }}>
      <div className="connection-panel__heading">
        <div><span className="settings-eyebrow">{t('settings.connection')}</span><h3>{editing.name}</h3></div>
        <button type="button" className="icon-button" aria-label={t('settings.close')} onClick={closeEditor}>×</button>
      </div>
      <div className="connection-fields">
        {editing.fields?.map((field) => field.type === 'checkbox' ? (
          <label className="connection-check" key={field.key}>
            <input type="checkbox" checked={values[field.key] === '1'} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked ? '1' : '0' }))} />
            <span>{field.label[locale]}</span>
          </label>
        ) : (
          <label className="connection-field" key={field.key}>
            <span>{field.label[locale]}{field.optional || editingConfigured ? '' : ' *'}</span>
            <input required={!field.optional && !editingConfigured} type={field.type ?? 'text'} placeholder={editingConfigured ? t('settings.fieldSaved') : field.placeholder} value={values[field.key] ?? ''} autoComplete={field.type === 'password' ? 'new-password' : 'off'} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
          </label>
        ))}
      </div>
      {(editing.oauth === 'gmail' || editing.oauth === 'spotify' || editing.oauth === 'lastfm' || editing.oauth === 'steam') && callbackBase && (
        <p className="connection-feedback">
          {t('settings.redirectUri')}<br />
          <code>{callbackBase}/api/settings/oauth/{editing.oauth}/callback</code>
        </p>
      )}
      <div className="connection-actions">
        <p className={`connection-feedback connection-feedback--${panelMsg ? 'saved' : saveState}`} role="status">
          {githubCode
            ? t('settings.githubCode', { code: githubCode })
            : (panelMsg ?? (saveState === 'saved' ? t('settings.savedRestart') : saveState === 'error' ? t('settings.saveError') : t('settings.encryptedHint')))}
        </p>
        <div className="connection-actions__buttons">
          {editing.id === 'weather' && <button type="button" className="settings-button settings-button--ghost" disabled={locating} onClick={() => void detectMyLocation()}>{locating ? t('settings.locating') : t('settings.useLocation')}</button>}
          {editing.oauth === 'github' && <button type="button" className="settings-button settings-button--ghost" disabled={githubBusy} onClick={() => void connectGitHub()}>{githubBusy ? t('settings.githubConnecting') : t('settings.githubSignIn')}</button>}
          {editing.oauth === 'steam' && <button type="button" className="settings-button settings-button--ghost" onClick={() => window.open('/api/settings/oauth/steam/start', '_blank', 'noopener,noreferrer')}>{t('settings.steamSignIn')}</button>}
          {(editing.oauth === 'gmail' || editing.oauth === 'spotify' || editing.oauth === 'lastfm') && <button type="button" className="settings-button settings-button--ghost" disabled={!oauthReady.includes(editing.oauth)} onClick={() => window.open(`/api/settings/oauth/${editing.oauth}/start`, '_blank', 'noopener,noreferrer')}>{oauthReady.includes(editing.oauth) ? t('settings.oauthConnect') : t('settings.oauthAfterRestart')}</button>}
          <button type="submit" className="settings-button" disabled={saveState === 'saving'}>{saveState === 'saving' ? t('settings.saving') : t('settings.save')}</button>
        </div>
      </div>
    </form>
  ) : null;

  return (
    <div className="settings-page">
      {wizard && <SetupWizard onClose={() => setWizard(false)} />}
      <header className="settings-heading">
        <div><p className="settings-eyebrow">Nohm</p><h1>{t('settings.title')}</h1><p>{t('settings.subtitle')}</p></div>
        <button type="button" className="settings-button settings-button--ghost" onClick={() => setWizard(true)}>{t('setup.title')}</button>
      </header>
      <section className="settings-card glass">
        <h2>{t('settings.language')}</h2>
        <div className="language-switch" role="group" aria-label={t('settings.language')}>
          <button type="button" className={locale === 'fr' ? 'is-active' : ''} onClick={() => setLocale('fr')}>{t('settings.french')}</button>
          <button type="button" className={locale === 'en' ? 'is-active' : ''} onClick={() => setLocale('en')}>{t('settings.english')}</button>
        </div>
      </section>
      <section className="settings-card glass">
        <h2>{t('settings.display')}</h2>
        <p className="settings-help">{t('settings.displayHint')}</p>
        <div className="settings-check-grid">
          {SECTIONS.filter((section) => section.id !== 'settings').map((section) => (
            <label key={section.id}>
              <input type="checkbox" checked={visibleSections.includes(section.id)} onChange={(event) => {
                const next = event.target.checked ? [...visibleSections, section.id] : visibleSections.filter((id) => id !== section.id);
                setVisibleSections(next);
                writeVisibleSections(next);
              }} />
              <span>{t(section.titleKey)}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="settings-card glass">
        <h2>{t('settings.polling')}</h2>
        <p className="settings-help">{t('settings.pollingHint')}</p>
        <select className="settings-select" value={refreshMultiplier} onChange={(event) => {
          const value = Number(event.target.value);
          setRefreshMultiplier(value);
          writeRefreshMultiplier(value);
        }}>
          <option value="0.5">{t('settings.pollingFast')}</option>
          <option value="1">{t('settings.pollingNormal')}</option>
          <option value="2">{t('settings.pollingCalm')}</option>
          <option value="4">{t('settings.pollingMinimal')}</option>
        </select>
      </section>
      <section className="settings-card glass">
        <h2>{t('settings.gameMode')}</h2>
        <p className="settings-help">{t('settings.gameShortcutHint')}</p>
        <label className="settings-field">
          <span>{t('settings.gameShortcut')}</span>
          <select className="settings-select" value={shortcut} onChange={(event) => setShortcut(event.target.value as GameShortcut)}>
            <option value="Alt+Shift+G">Alt + Maj + G</option>
            <option value="Ctrl+Shift+G">Ctrl + Maj + G</option>
            <option value="Alt+Shift+N">Alt + Maj + N</option>
          </select>
        </label>
      </section>
      <section className="settings-card glass">
        <h2>{t('settings.remoteAccess')}</h2>
        <p className="settings-help">{t('settings.remoteAccessHint')}</p>
        <label className="settings-field">
          <span>{t('settings.publicUrl')}</span>
          <input
            className="settings-select"
            type="url"
            inputMode="url"
            placeholder={callbackBase.startsWith('http://127.0.0.1') ? 'https://mon-pc.mon-tailnet.ts.net' : callbackBase}
            value={publicUrlDraft}
            onChange={(event) => { setPublicUrlDraft(event.target.value); setPublicUrlState('idle'); }}
          />
        </label>
        <div className="connection-actions__buttons" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="settings-button settings-button--small" disabled={publicUrlState === 'saving'} onClick={() => void savePublicUrl()}>
            {publicUrlState === 'saving' ? t('settings.saving') : t('settings.saveShort')}
          </button>
        </div>
        <p className={`settings-help${publicUrlState === 'saved' ? ' connection-feedback--saved' : ''}${publicUrlState === 'error' ? ' connection-feedback--error' : ''}`}>
          {publicUrlState === 'saved' ? t('settings.savedRestart') : publicUrlState === 'error' ? t('settings.saveError') : t('settings.callbackBase', { base: callbackBase || '—' })}
        </p>
      </section>
      <section className="settings-card glass">
        <h2>{t('settings.services')}</h2>
        <p className="settings-help">{t('settings.servicesHint')}</p>
        <div className="service-list">
          {SERVICE_CATALOG.map((service) => {
            const runtimeStatus = serviceStatus(service.widgetIds, summaries);
            const status = runtimeStatus === 'notConfigured' && configured.includes(service.id) ? 'offline' : runtimeStatus;
            return (
              <Fragment key={service.id}>
                <article className="service-row">
                  <div className={`service-status service-status--${status}`} aria-hidden />
                  <div className="service-main"><strong>{service.name}</strong><p>{service.setup[locale]}</p></div>
                  <dl className="service-meta">
                    <div><dt>{t('settings.permissions')}</dt><dd>{service.permissions[locale]}</dd></div>
                    <div><dt>{t('settings.refresh')}</dt><dd>{service.refresh}{service.localOnly ? ` · ${t('settings.localOnly')}` : ''}</dd></div>
                  </dl>
                  <span className="service-state">{t(`settings.${status}`)}</span>
                  {service.fields ? <button type="button" className="settings-button settings-button--small" onClick={() => editing?.id === service.id ? closeEditor() : openEditor(service)}>{configured.includes(service.id) ? t('settings.modify') : t('settings.configure')}</button> : <button type="button" className="settings-button settings-button--small" disabled={!service.widgetIds[0] || testing === service.id} onClick={() => void test(service.widgetIds[0]!, service.id)}>{testing === service.id ? t('settings.testing') : t('settings.test')}</button>}
                </article>
                {editing?.id === service.id && connectionEditor}
              </Fragment>
            );
          })}
        </div>
      </section>
    </div>
  );
}
