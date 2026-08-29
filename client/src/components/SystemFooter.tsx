import type { SystemData } from '@nohm/shared';
import { useWidget } from '../useWidget';
import { useI18n } from '../i18n/I18nProvider';

function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

/** Unobtrusive one-line server status; renders nothing until data is available. */
export function SystemFooter() {
  const { t, date } = useI18n();
  const { envelope } = useWidget<SystemData>('system');
  const data = envelope?.data;
  if (!data) return null;

  return (
    <footer className="mt-7 flex items-center justify-center border-t border-card-border px-1 pt-5 text-[11px] text-ink-faint">
      <span>{data.hostname} · {t('system.uptime', { time: formatUptime(data.uptimeSeconds) })} · {date(data.serverTime, { dateStyle: 'medium', timeStyle: 'medium', timeZone: data.timezone })} {data.timezone}</span>
    </footer>
  );
}
