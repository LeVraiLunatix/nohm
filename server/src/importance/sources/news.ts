import type { AiNewsData, NewsData } from '@nohm/shared';

import type { Candidate } from '../types.js';

export function newsCandidates(data: NewsData | undefined): Candidate[] {
  const headline = data?.items[0];
  if (!headline) return [];
  return [{
    id: `news:${headline.url}`, source: 'news', kind: 'news', score: 23, shapes: ['tile'],
    kicker: headline.source, title: headline.title, detail: 'Latest headline', href: '#/personal/news', render: { type: 'text' },
  }];
}

/** Same treatment as newsCandidates, but a distinct `source` so an AI headline competes for its
 * own slot alongside — not instead of — the general news headline. */
export function aiNewsCandidates(data: AiNewsData | undefined): Candidate[] {
  const headline = data?.items[0];
  if (!headline) return [];
  return [{
    id: `ai-news:${headline.url}`, source: 'ai-news', kind: 'news', score: 23, shapes: ['tile'],
    kicker: headline.source, title: headline.title, detail: 'Latest AI headline', href: '#/ai', render: { type: 'text' },
  }];
}
