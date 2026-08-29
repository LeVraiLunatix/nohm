import { useI18n } from '../../i18n/I18nProvider';

interface UsageRefreshButtonProps {
  label: string;
  refreshing: boolean;
  onRefresh: () => Promise<void>;
}

export function UsageRefreshButton({
  label,
  refreshing,
  onRefresh,
}: Readonly<UsageRefreshButtonProps>) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="rounded px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-track hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent-ai) disabled:cursor-wait disabled:opacity-60"
      onClick={(event) => {
        // ToolRow lives inside SectionCard's whole-card <a> on the overview page —
        // without this the click bubbles up and navigates away before the refresh shows.
        event.stopPropagation();
        event.preventDefault();
        void onRefresh();
      }}
      disabled={refreshing}
      aria-label={t('ai.refreshLabel', { name: label })}
    >
      {refreshing ? t('ai.refreshing') : t('ai.refresh')}
    </button>
  );
}
