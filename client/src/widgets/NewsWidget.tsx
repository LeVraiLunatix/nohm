import type { NewsData } from '@nohm/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';

export function NewsWidget({ scrollable }: Readonly<{ scrollable?: boolean }> = {}) {
  const { envelope, offline } = useWidget<NewsData>('news');

  return (
    <WidgetCard title="News" envelope={envelope} offline={offline}>
      {(data) => (
        <ul className={`space-y-1.5 text-sm ${scrollable ? 'h-[19rem] overflow-y-auto pr-1' : ''}`}>
          {data.items.map((item) => (
            <li key={item.url} className="leading-tight">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-ink hover:underline"
              >
                {item.title}
              </a>
              <div className="text-xs text-ink-faint">
                {item.source} · {relativeTime(item.publishedAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
