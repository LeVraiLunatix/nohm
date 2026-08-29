import { useI18n } from '../i18n/I18nProvider';

/** Only rendered in the public demo build (see main.tsx) — makes it unmistakable that every
 * number on the page is fake before a visitor mistakes it for someone's real data. */
export function DemoBanner() {
  const { t } = useI18n();
  return (
    <a
      href="https://github.com/joachimvn/Personal-Dashboard"
      target="_blank"
      rel="noreferrer"
      className="sticky inset-x-0 top-0 z-50 flex items-center justify-center gap-1.5 bg-(--color-accent-personal) px-3 py-1.5 text-center text-[11px] font-medium text-white"
    >
      {t('demo.banner')}
    </a>
  );
}
