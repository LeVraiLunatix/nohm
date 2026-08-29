import { useEffect, useState, type CSSProperties } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/translations';
import type { SectionId } from '../registry';
import { writeVisibleSections } from './preferences';

const SETUP_KEY = 'nohm.setup.completed';
const DISMISSED_KEY = 'nohm.setup.dismissed';
interface SetupSpace {
  id: Exclude<SectionId, 'settings'>;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  accentVar: string;
  glyph: string;
}

// Kept independent from registry.tsx so Settings -> SetupWizard does not create a runtime cycle.
const SELECTABLE_SECTIONS: SetupSpace[] = [
  { id: 'ai', titleKey: 'section.ai.title', descriptionKey: 'section.ai.description', accentVar: '--color-accent-ai', glyph: '✦' },
  { id: 'github', titleKey: 'section.github.title', descriptionKey: 'section.github.description', accentVar: '--color-accent-github', glyph: '</>' },
  { id: 'spotify', titleKey: 'section.spotify.title', descriptionKey: 'section.spotify.description', accentVar: '--color-accent-spotify', glyph: '♪' },
  { id: 'personal', titleKey: 'section.personal.title', descriptionKey: 'section.personal.description', accentVar: '--color-accent-personal', glyph: '◷' },
  { id: 'weather', titleKey: 'section.weather.title', descriptionKey: 'section.weather.description', accentVar: '--color-accent-weather', glyph: '☼' },
  { id: 'health', titleKey: 'section.health.title', descriptionKey: 'section.health.description', accentVar: '--color-accent-health', glyph: '♥' },
  { id: 'steam', titleKey: 'section.steam.title', descriptionKey: 'section.steam.description', accentVar: '--color-accent-steam', glyph: '◎' },
  { id: 'clash-royale', titleKey: 'section.clash-royale.title', descriptionKey: 'section.clash-royale.description', accentVar: '--color-accent-clash-royale', glyph: '♛' },
  { id: 'valorant', titleKey: 'section.valorant.title', descriptionKey: 'section.valorant.description', accentVar: '--color-accent-valorant', glyph: 'V' },
];
const DEFAULT_SECTIONS: SectionId[] = ['ai', 'spotify', 'personal', 'weather'];

export function needsSetup(): boolean {
  return window.localStorage.getItem(SETUP_KEY) !== 'true'
    && window.localStorage.getItem(DISMISSED_KEY) !== 'true';
}

export function SetupWizard({ onClose }: Readonly<{ onClose: () => void }>) {
  const { t } = useI18n();
  const [step, setStep] = useState<0 | 1>(0);
  const [selected, setSelected] = useState(() => new Set<SectionId>(DEFAULT_SECTIONS));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const finish = () => {
    window.localStorage.setItem(SETUP_KEY, 'true');
    window.localStorage.setItem('nohm.modules', JSON.stringify([...selected]));
    writeVisibleSections(selected);
    onClose();
  };

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, 'true');
    onClose();
  };

  const toggle = (id: SectionId) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div className="setup-backdrop" role="presentation">
      <section className="setup-shell glass" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <aside className="setup-sidebar">
          <div className="nohm-brand-lockup"><span className="nohm-monogram">N</span><span>Nohm</span></div>
          <div className="setup-progress" aria-label={t('setup.progress')}>
            <div className={`setup-progress__item${step === 0 ? ' is-current' : ' is-complete'}`}>
              <span>{step === 0 ? '01' : '✓'}</span><div><strong>{t('setup.stepWelcome')}</strong><small>{t('setup.stepWelcomeHint')}</small></div>
            </div>
            <div className={`setup-progress__item${step === 1 ? ' is-current' : ''}`}>
              <span>02</span><div><strong>{t('setup.stepSpaces')}</strong><small>{t('setup.stepSpacesHint')}</small></div>
            </div>
          </div>
          <div className="setup-sidebar__art" aria-hidden>
            <span className="setup-orbit setup-orbit--one" /><span className="setup-orbit setup-orbit--two" />
            <span className="setup-orbit__core">N</span>
          </div>
          <div className="setup-privacy"><span aria-hidden>⌁</span><p><strong>{t('setup.localTitle')}</strong><small>{t('setup.localHint')}</small></p></div>
        </aside>

        <div className="setup-stage">
          <header className="setup-stage__topbar">
            <span>{t('setup.stepCount', { current: String(step + 1) })}</span>
            <button type="button" className="icon-button" aria-label={t('settings.close')} onClick={onClose}>×</button>
          </header>

          <div className="setup-stage__body">
            {step === 0 ? (
              <div className="setup-welcome">
                <span className="setup-kicker">{t('setup.kicker')}</span>
                <h1 id="setup-title">{t('setup.title')}</h1>
                <p className="setup-lead">{t('setup.subtitle')}</p>
                <div className="setup-benefits">
                  <article><span aria-hidden>✦</span><div><strong>{t('setup.benefitFocus')}</strong><p>{t('setup.benefitFocusHint')}</p></div></article>
                  <article><span aria-hidden>⌂</span><div><strong>{t('setup.benefitLocal')}</strong><p>{t('setup.benefitLocalHint')}</p></div></article>
                  <article><span aria-hidden>↻</span><div><strong>{t('setup.benefitFlexible')}</strong><p>{t('setup.benefitFlexibleHint')}</p></div></article>
                </div>
                <div className="setup-mini-dashboard" aria-hidden>
                  <div><i /><i /><i /></div><span /><span /><span /><span />
                </div>
              </div>
            ) : (
              <div className="setup-picker">
                <span className="setup-kicker">{t('setup.personalize')}</span>
                <div className="setup-picker__heading">
                  <div><h1 id="setup-title">{t('setup.chooseTitle')}</h1><p>{t('setup.chooseHint')}</p></div>
                  <div className="setup-selection-count"><strong>{selected.size}</strong><span>{t('setup.selected')}</span></div>
                </div>
                <div className="setup-picker__tools">
                  <span>{t('setup.spacesAvailable', { count: String(SELECTABLE_SECTIONS.length) })}</span>
                  <button type="button" onClick={() => setSelected(new Set(SELECTABLE_SECTIONS.map((section) => section.id)))}>{t('setup.selectAll')}</button>
                </div>
                <div className="setup-space-grid">
                  {SELECTABLE_SECTIONS.map((section) => {
                    const active = selected.has(section.id);
                    return (
                      <button
                        type="button"
                        key={section.id}
                        className={`setup-space-card${active ? ' is-selected' : ''}`}
                        style={{ '--setup-accent': `var(${section.accentVar})` } as CSSProperties}
                        aria-pressed={active}
                        onClick={() => toggle(section.id)}
                      >
                        <span className="setup-space-card__icon" aria-hidden>{section.glyph}</span>
                        <span className="setup-space-card__copy"><strong>{t(section.titleKey)}</strong><small>{t(section.descriptionKey)}</small></span>
                        <span className="setup-space-card__check" aria-hidden>{active ? '✓' : '+'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <footer className="setup-actions">
            {step === 0 ? (
              <><button type="button" className="settings-button settings-button--ghost" onClick={dismiss}>{t('setup.later')}</button><button type="button" className="settings-button setup-primary-action" onClick={() => setStep(1)}>{t('setup.continue')} <span aria-hidden>→</span></button></>
            ) : (
              <><button type="button" className="settings-button settings-button--ghost" onClick={() => setStep(0)}>← {t('setup.back')}</button><button type="button" className="settings-button setup-primary-action" disabled={selected.size === 0} onClick={finish}>{t('setup.finish')} <span aria-hidden>✓</span></button></>
            )}
          </footer>
        </div>
      </section>
    </div>
  );
}
