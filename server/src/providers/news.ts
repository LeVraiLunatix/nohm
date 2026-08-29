import Parser from 'rss-parser';
import { newsSchema, type NewsData } from '@nohm/shared';
import type { Provider } from '../scheduler.js';

const MAX_ITEMS = 12;

export interface NewsFeed {
  name: string;
  url: string;
}

interface FeedItem {
  url: string;
  publishedAt: string;
}

/**
 * Keep the news card useful when one high-volume feed (e.g. NRK) publishes far
 * more stories than the others. Each healthy feed gets its newest headline
 * first; the remaining slots are then split evenly across feeds by recency,
 * so no single feed can crowd out a quieter one. A feed only gets more than
 * its even share if another feed doesn't have enough items to fill its own.
 */
export function selectNewsItems<T extends FeedItem>(feedItems: T[][], maxItems = MAX_ITEMS): T[] {
  const groups = feedItems
    .map((items) => items.filter((item) => item.url).toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt)))
    .filter((items) => items.length > 0);
  const leading = groups.map(([item]) => item);
  const rest = groups.map(([, ...items]) => items);

  const remainingSlots = Math.max(maxItems - leading.length, 0);
  const capPerFeed = rest.length > 0 ? Math.ceil(remainingSlots / rest.length) : remainingSlots;
  const cappedRest = rest.flatMap((items) => items.slice(0, capPerFeed));
  const overflowRest = rest.flatMap((items) => items.slice(capPerFeed));

  const combined = [
    ...leading.toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    ...cappedRest.toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    ...overflowRest.toSorted((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
  ];
  // The same story can appear in more than one feed (e.g. a regional and a national
  // NRK feed); keep only its first, highest-priority occurrence.
  const seenUrls = new Set<string>();
  const deduped = combined.filter((item) => (seenUrls.has(item.url) ? false : (seenUrls.add(item.url), true)));

  return deduped.slice(0, maxItems);
}

export function createNewsProvider(feeds: NewsFeed[]): Provider<NewsData> {
  const parser = new Parser({ timeout: 10_000 });

  return {
    id: 'news',
    schema: newsSchema,
    refreshMs: 30 * 60_000,
    timeoutMs: 25_000,
    isConfigured: () => feeds.length > 0,
    async fetch() {
      const results = await Promise.allSettled(
        feeds.map(async (feed) => {
          const parsed = await parser.parseURL(feed.url);
          return (parsed.items ?? []).slice(0, MAX_ITEMS).map((item) => ({
            title: item.title ?? '(untitled)',
            source: feed.name,
            url: item.link ?? '',
            publishedAt: item.isoDate ?? new Date(0).toISOString(),
          }));
        }),
      );
      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      if (fulfilled.length === 0) throw new Error('all feeds failed');
      return {
        items: selectNewsItems(fulfilled.map((result) => result.value)),
      };
    },
  };
}
