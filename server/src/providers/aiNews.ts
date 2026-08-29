import Parser from 'rss-parser';
import { aiNewsSchema, type AiNewsData } from '@nohm/shared';
import type { Provider } from '../scheduler.js';
import { selectNewsItems } from './news.js';

/** Per-provider cap, not a shared pool — otherwise a high-volume feed (e.g. OpenAI's blog) crowds
 * out a lower-volume one (Anthropic's Google News proxy) in the merged list. Matches News's own
 * fetch cap; on the Personal page the client renders all of these in a fixed-height scrollable
 * list (see AiNews.tsx) rather than a content-based height, since how much a headline wraps varies
 * by viewport in a way a fixed item count alone can't compensate for. */
const MAX_ITEMS_PER_PROVIDER = 12;

/** Google News search-result titles are suffixed with " - <publisher>"; strip it since the
 * publisher is already shown as the item's source line right below the title. */
function stripPublisherSuffix(title: string, publisher: string): string {
  const suffix = ` - ${publisher}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

type AiNewsItem = AiNewsData['items'][number];

export interface AiNewsFeed {
  name: string;
  url: string;
  provider: AiNewsItem['provider'];
}

export function createAiNewsProvider(feeds: AiNewsFeed[]): Provider<AiNewsData> {
  const parser = new Parser({ timeout: 10_000 });

  return {
    id: 'ai-news',
    schema: aiNewsSchema,
    refreshMs: 30 * 60_000,
    timeoutMs: 25_000,
    isConfigured: () => feeds.length > 0,
    async fetch() {
      const results = await Promise.allSettled(
        feeds.map(async (feed) => {
          const parsed = await parser.parseURL(feed.url);
          const items: AiNewsItem[] = (parsed.items ?? []).map((item) => ({
            title: stripPublisherSuffix(item.title ?? '(untitled)', feed.name),
            source: feed.name,
            url: item.link ?? '',
            publishedAt: item.isoDate ?? new Date(0).toISOString(),
            provider: feed.provider,
          }));
          return { provider: feed.provider, items };
        }),
      );
      const fulfilled = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      if (fulfilled.length === 0) throw new Error('all feeds failed');

      const items = (['openai', 'anthropic'] satisfies AiNewsItem['provider'][]).flatMap((provider) =>
        selectNewsItems(
          fulfilled.filter((feed) => feed.provider === provider).map((feed) => feed.items),
          MAX_ITEMS_PER_PROVIDER,
        ),
      );
      return { items };
    },
  };
}
