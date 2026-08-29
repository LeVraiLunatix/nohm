import { useEffect, useState } from 'react';
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
  const [editing, setEditing] = useState<ServiceDefinition | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [wizard, setWizard] = useState(false);
  const [visibleSections, setVisibleSections] = useState(readVisibleSections);
  const [refreshMultiplier, setRefreshMultiplier] = useState(readRefreshMultiplier);
  const { shortcut, setShortcut } = useGameMode();

  useEffect(() => {
    void fetch('/api/widgets').then((response) => response.ok ? response.json() : { widgets: [] }).then((payload) => setSummaries(payload.widgets ?? [])).catch(() => setSummaries([]));
    void fetch('/api/settings/services').then((response) => response.ok ? response.json() : { configured: [], oauthReady: [] }).then((payload) => { setConfigured(payload.configured ?? []); setOauthReady(payload.oauthReady ?? []); }).catch(() => { setConfigured([]); setOauthReady([]); });
  }, []);

  const openEditor = (service: ServiceDefinition) => {
    setEditing(service);
    setValues(Object.fromEntries((service.fields ?? []).map((field) => [field.key, field.type === 'checkbox' ? '0' : ''])));
    setSaveState('idle');
  };

  const saveConnection = async () => {
    if (!editing) return;
    setSaveState('saving');
    const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
    try {
      const response = await fetch(`/api/settings/services/${encodeURIComponent(editing.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('save failed');
      setConfigured((current) => current.includes(editing.id) ? current : [...current, editing.id]);
      setValues({});
      setSaveState('saved');
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
        <h2>{t('settings.services')}</h2>
        <p className="settings-help">{t('settings.servicesHint')}</p>
        {editing && (
          <form className="connection-panel" onSubmit={(event) => { event.preventDefault(); void saveConnection(); }}>
            <div className="connection-panel__heading">
              <div><span className="settings-eyebrow">{t('settings.connection')}</span><h3>{editing.name}</h3></div>
              <button type="button" className="icon-button" aria-label={t('settings.close')} onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="connection-fields">
              {editing.fields?.map((field) => field.type === 'checkbox' ? (
                <label className="connection-check" key={field.key}>
                  <input type="checkbox" checked={values[field.key] === '1'} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked ? '1' : '0' }))} />
                  <span>{field.label[locale]}</span>
                </label>
              ) : (
                <label className="connection-field" key={field.key}>
                  <span>{field.label[locale]}{field.optional ? '' : ' *'}</span>
                  <input required={!field.optional} type={field.type ?? 'text'} placeholder={field.placeholder} value={values[field.key] ?? ''} autoComplete={field.type === 'password' ? 'new-password' : 'off'} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
                </label>
              ))}
            </div>
            <div className="connection-actions">
              <p className={`connection-feedback connection-feedback--${saveState}`} role="status">
                {saveState === 'saved' ? t('settings.savedRestart') : saveState === 'error' ? t('settings.saveError') : t('settings.encryptedHint')}
              </p>
              <div className="connection-actions__buttons">
                {editing.oauth && <button type="button" className="settings-button settings-button--ghost" disabled={!oauthReady.includes(editing.oauth)} onClick={() => window.open(`/api/settings/oauth/${editing.oauth}/start`, '_blank', 'noopener,noreferrer')}>{oauthReady.includes(editing.oauth) ? t('settings.oauthConnect') : t('settings.oauthAfterRestart')}</button>}
                <button type="submit" className="settings-button" disabled={saveState === 'saving'}>{saveState === 'saving' ? t('settings.saving') : t('settings.save')}</button>
              </div>
            </div>
          </form>
        )}
        <div className="service-list">
          {SERVICE_CATALOG.map((service) => {
            const runtimeStatus = serviceStatus(service.widgetIds, summaries);
            const status = runtimeStatus === 'notConfigured' && configured.includes(service.id) ? 'offline' : runtimeStatus;
            return (
              <article className="service-row" key={service.id}>
                <div className={`service-status service-status--${status}`} aria-hidden />
                <div className="service-main"><strong>{service.name}</strong><p>{service.setup[locale]}</p></div>
                <dl className="service-meta">
                  <div><dt>{t('settings.permissions')}</dt><dd>{service.permissions[locale]}</dd></div>
                  <div><dt>{t('settings.refresh')}</dt><dd>{service.refresh}{service.localOnly ? ` · ${t('settings.localOnly')}` : ''}</dd></div>
                </dl>
                <span className="service-state">{t(`settings.${status}`)}</span>
                {service.fields ? <button type="button" className="settings-button settings-button--small" onClick={() => openEditor(service)}>{configured.includes(service.id) ? t('settings.modify') : t('settings.configure')}</button> : <button type="button" className="settings-button settings-button--small" disabled={!service.widgetIds[0] || testing === service.id} onClick={() => void test(service.widgetIds[0]!, service.id)}>{testing === service.id ? t('settings.testing') : t('settings.test')}</button>}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
