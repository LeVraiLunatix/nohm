import type { ReactNode } from 'react';
import type { WidgetEnvelope } from '@nohm/shared';
import { relativeTime } from '../lib/time';
import { useI18n } from '../i18n/I18nProvider';

interface WidgetCardProps<T> {
  readonly title: string;
  readonly envelope: WidgetEnvelope<T> | null;
  readonly offline: boolean;
  readonly children: (data: T) => ReactNode;
  readonly errorFallback?: (envelope: WidgetEnvelope<T>) => ReactNode | undefined;
}

export function WidgetCard<T>({ title, envelope, offline, children, errorFallback }: WidgetCardProps<T>) {
  if (envelope?.status === 'disabled') return null;
  return (
    <WidgetShell title={title} badge={<StaleBadge envelope={envelope} />}>
      <WidgetBody envelope={envelope} offline={offline} errorFallback={errorFallback}>
        {children}
      </WidgetBody>
    </WidgetShell>
  );
}

/** True once the server reports this widget was turned off in config.json (vs. still loading, or on but unconfigured). */
export function isWidgetDisabled(envelope: WidgetEnvelope<unknown> | null): boolean {
  return envelope?.status === 'disabled';
}

/** Amber "updated Xm ago" pill shown while a widget serves cached data after a failed refresh. */
export function StaleBadge({ envelope }: Readonly<{ envelope: WidgetEnvelope<unknown> | null }>) {
  const { t } = useI18n();
  if (envelope?.status !== 'stale' || !envelope.fetchedAt) return null;
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
      {t('widget.stale', { time: relativeTime(envelope.fetchedAt) })}
    </span>
  );
}

/** Card chrome (border/header) without the single-envelope status machine — for cards that combine multiple independently-polled sections. */
export function WidgetShell({
  title,
  icon,
  badge,
  children,
}: Readonly<{
  title: string;
  icon?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className="glass rounded-[1.5rem] p-5 transition-[border-color,box-shadow] duration-300 hover:border-white/15 sm:p-6">
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-ink-muted">
          {icon}
          {title}
        </h2>
        {badge}
      </header>
      {children}
    </section>
  );
}

/** The loading/disabled/error/ready state machine, reusable for a single section within a WidgetShell. */
export function WidgetBody<T>({
  envelope,
  offline,
  children,
  errorFallback,
}: Omit<WidgetCardProps<T>, 'title'>) {
  const { t } = useI18n();
  if (offline && !envelope) {
    return <p className="text-sm text-rose-500">{t('widget.offline')}</p>;
  }
  if (!envelope || envelope.status === 'loading') {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-4 w-3/4 rounded bg-track" />
        <div className="h-4 w-1/2 rounded bg-track" />
      </div>
    );
  }
  if (envelope.status === 'disabled') {
    return (
      <p className="text-sm text-ink-faint">
        {t('widget.disabled')}
      </p>
    );
  }
  if (envelope.status === 'error' || envelope.data === undefined) {
    const fallback = errorFallback?.(envelope);
    if (fallback) return fallback;
    return <p className="text-sm text-rose-500">{t('widget.error', { error: envelope.error ?? 'unknown' })}</p>;
  }
  return <>{children(envelope.data)}</>;
}
