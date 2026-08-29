import type { GitHubData } from '@nohm/shared';

import { computeDeviation } from '../../deviation.js';
import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

function githubPullRequestKicker(kind: 'review' | 'open-pr', count: number): string {
  if (kind === 'review') return count > 1 ? `${count} reviews waiting` : 'Review requested';
  return count > 1 ? `${count} open pull requests` : 'Open pull request';
}

function githubPullRequestCandidate(
  pullRequest: GitHubData['pullRequests'][number],
  kind: 'review' | 'open-pr',
  count: number,
): Candidate {
  const isReview = kind === 'review';
  return {
    id: `github:${kind}:${pullRequest.repo}:${pullRequest.number}`, source: 'github', kind: 'github', score: isReview ? 91 : 50,
    shapes: [...allShapes], kicker: githubPullRequestKicker(kind, count),
    title: pullRequest.title, detail: pullRequest.repo, href: '#/github',
    render: { type: isReview ? 'github-reviews' : 'github-open-prs' },
  };
}

function contributionCandidates(
  data: GitHubData,
  days: GitHubData['contributions']['days'],
  baselineWindowDays: number,
  baselineDeviationPercent: number,
): Candidate[] {
  const today = days.at(-1)?.count ?? 0;
  const candidates: Candidate[] = [];
  const priorCounts = days.slice(-(baselineWindowDays + 1), -1).map((day) => day.count);
  const deviation = computeDeviation(today, priorCounts, baselineDeviationPercent);
  if (deviation?.anomalous && deviation.direction === 'above') {
    candidates.push({
      id: 'github:contributions-anomaly', source: 'github', kind: 'github', score: 80, shapes: [...allShapes],
      kicker: 'Big day on GitHub', title: `${today} contributions today`,
      detail: `${deviation.deviationPercent.toFixed(0)}% above your usual ${deviation.average.toFixed(1)}/day`,
      href: '#/github', render: { type: 'github-contributions' },
    });
  }
  if (today > 0) {
    candidates.push({
      id: 'github:contributions', source: 'github', kind: 'github', score: 36,
      shapes: ['tile'], kicker: 'This week on GitHub',
      title: `${today} contribution${today === 1 ? '' : 's'} today`,
      detail: `${data.pullRequests.length} open pull requests`, href: '#/github', render: { type: 'github-contributions' },
    });
  } else {
    const recentWeek = days.slice(-7).reduce((total, day) => total + day.count, 0);
    if (recentWeek > 0) {
      candidates.push({
        id: 'github:recent-contributions', source: 'github', kind: 'github', score: 27, shapes: ['tile'],
        kicker: 'This week on GitHub', title: `${recentWeek} contribution${recentWeek === 1 ? '' : 's'} this week`,
        detail: 'Your recent contribution history', href: '#/github', render: { type: 'github-contributions' },
      });
    }
  }
  return candidates;
}

export function githubCandidates(
  data: GitHubData | undefined,
  baselineWindowDays: number,
  baselineDeviationPercent: number,
): Candidate[] {
  if (!data) return [];
  const reviews = data.pullRequests.filter((pr) => pr.role === 'review-requested');
  const openPrs = data.pullRequests.filter((pr) => pr.role === 'author' && !pr.draft);
  const days = data.contributions.days;
  const candidates: Candidate[] = [];
  if (reviews.length) {
    candidates.push(githubPullRequestCandidate(reviews[0], 'review', reviews.length));
  }
  if (openPrs.length) {
    candidates.push(githubPullRequestCandidate(openPrs[0], 'open-pr', openPrs.length));
  }
  candidates.push(...contributionCandidates(data, days, baselineWindowDays, baselineDeviationPercent));
  return candidates;
}
