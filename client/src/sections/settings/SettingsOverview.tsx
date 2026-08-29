import { useI18n } from '../../i18n/I18nProvider';

export function SettingsOverview() {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-3">
      <p className="text-3xl font-semibold text-ink">{locale === 'fr' ? 'Français' : 'English'}</p>
      <p className="text-sm text-ink-muted">{t('settings.subtitle')}</p>
    </div>
  );
}
