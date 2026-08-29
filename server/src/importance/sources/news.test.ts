import { describe, expect, it } from 'vitest';
import type { AiNewsData, NewsData } from '@nohm/shared';
import { aiNewsCandidates, newsCandidates } from './news.js';

describe('newsCandidates', () => {
  it('keeps the latest headline available as a low-priority tile', () => {
    const data: NewsData = { items: [{ title: 'A useful headline', source: 'Source', url: 'https://example.com/news', publishedAt: '2026-07-16T00:00:00Z' }] };

    expect(newsCandidates(data)).toContainEqual(expect.objectContaining({
      kicker: 'Source', title: 'A useful headline', shapes: ['tile'],
    }));
  });
});

describe('aiNewsCandidates', () => {
  it('surfaces the latest AI headline under its own source, distinct from general news', () => {
    const data: AiNewsData = { items: [{ title: 'New model released', source: 'OpenAI', url: 'https://example.com/ai-news', publishedAt: '2026-07-16T00:00:00Z', provider: 'openai' }] };

    expect(aiNewsCandidates(data)).toContainEqual(expect.objectContaining({
      source: 'ai-news', kicker: 'OpenAI', title: 'New model released', shapes: ['tile'], href: '#/ai',
    }));
  });
});
