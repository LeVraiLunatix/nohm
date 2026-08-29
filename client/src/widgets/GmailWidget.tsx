import type { GmailData } from '@nohm/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';
import { AnimatedNumber } from '../components/AnimatedNumber';

export function GmailWidget() {
  const { envelope, offline } = useWidget<GmailData>('gmail');

  return (
    <WidgetCard title="Mail" envelope={envelope} offline={offline}>
      {(data) => (
        <div>
          <p className="mb-2 text-sm">
            <span className="text-2xl font-bold tabular-nums">
              <AnimatedNumber value={data.unreadThreads} />
            </span>{' '}
            <span className="text-ink-muted">unread</span>
          </p>
          <ul className="max-h-[19rem] space-y-1.5 overflow-y-auto pr-1 text-sm">
            {data.threads.map((thread) => (
              <li key={thread.id}>
                <a
                  href={thread.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block min-w-0"
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={`truncate ${
                        thread.unread
                          ? 'font-semibold'
                          : 'text-ink-muted'
                      }`}
                    >
                      {thread.from}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-ink-faint">
                      {relativeTime(thread.date)}
                    </span>
                  </span>
                  <span
                    className={`block truncate text-xs group-hover:underline ${
                      thread.unread
                        ? 'text-ink'
                        : 'text-ink-faint'
                    }`}
                  >
                    {thread.subject}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </WidgetCard>
  );
}
