import { describe, expect, it } from 'vitest';
import type { GitHubData } from '@nohm/shared';
import { githubCandidates } from './github.js';

describe('githubCandidates', () => {
  const quietDay: GitHubData = {
    activity: [],
    pullRequests: [],
    issues: [],
    contributions: { total: 2019, days: [{ date: '2026-07-16', count: 0 }] },
    repoHealth: [],
  };

  it('does not surface a quiet contribution graph', () => {
    expect(githubCandidates(quietDay, 7, 50)).not.toContainEqual(expect.objectContaining({ id: 'github:contributions' }));
  });

  it('allows an active contribution day into the secondary carousel', () => {
    const data = {
      ...quietDay,
      contributions: { ...quietDay.contributions, days: [{ date: '2026-07-16', count: 1 }] },
    };
    const candidate = githubCandidates(data, 7, 50).find((item) => item.id === 'github:contributions');

    expect(candidate).toMatchObject({ title: '1 contribution today', shapes: ['tile'] });
  });

  it('keeps a recent weekly contribution graph available when today is quiet', () => {
    const data = {
      ...quietDay,
      contributions: { ...quietDay.contributions, days: [
        { date: '2026-07-10', count: 3 }, { date: '2026-07-16', count: 0 },
      ] },
    };

    expect(githubCandidates(data, 7, 50)).toContainEqual(expect.objectContaining({
      id: 'github:recent-contributions', title: '3 contributions this week', shapes: ['tile'],
    }));
  });

  it('surfaces an authored open pull request as a thin-row candidate', () => {
    const data: GitHubData = {
      ...quietDay,
      pullRequests: [
        { title: 'Add issue counts to Sonar widget', repo: 'Personal-Dashboard', number: 31, url: 'https://example.com/31', role: 'author', draft: false, updatedAt: '2026-07-30T00:00:00Z' },
      ],
    };

    expect(githubCandidates(data, 7, 50)).toContainEqual(expect.objectContaining({
      id: 'github:open-pr:Personal-Dashboard:31', title: 'Add issue counts to Sonar widget',
      kicker: 'Open pull request', render: { type: 'github-open-prs' },
    }));
  });

  it('ignores draft pull requests for the open-PR candidate', () => {
    const data: GitHubData = {
      ...quietDay,
      pullRequests: [
        { title: 'WIP', repo: 'Personal-Dashboard', number: 32, url: 'https://example.com/32', role: 'author', draft: true, updatedAt: '2026-07-30T00:00:00Z' },
      ],
    };

    expect(githubCandidates(data, 7, 50)).not.toContainEqual(expect.objectContaining({ render: { type: 'github-open-prs' } }));
  });
});
