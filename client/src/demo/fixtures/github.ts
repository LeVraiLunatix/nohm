import type { GitHubData, SonarCloudData } from '@nohm/shared';
import { iso, mulberry32 } from '@nohm/shared';

// ── GitHub ───────────────────────────────────────────────────────────────────────────────────

function contributionDays(now: Date, rng: () => number) {
  const days: { date: string; count: number }[] = [];
  for (let i = 364; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000);
    const weekend = i % 7 === 0 || i % 7 === 1;
    const roll = rng();
    let count: number;
    if (weekend) count = roll < 0.3 ? Math.round(rng() * rng() * 6) : 0;
    else if (roll < 0.1) count = 0;
    else count = Math.round(1 + rng() * rng() * 13);
    if (i < 3) count = Math.max(count, 2 + Math.round(rng() * 4));
    days.push({ date: date.toISOString().slice(0, 10), count });
  }
  return days;
}

export function github(now: Date): GitHubData {
  const rng = mulberry32(42);
  const days = contributionDays(now, rng);
  return {
    activity: [
      {
        id: 'ev1', summary: '3 commits', repo: 'yourname/nohm', timestamp: iso(now, -2), url: '#', branch: 'dev',
        commits: [
          { sha: 'a1b2c3d', title: 'Add importance scoring to the command center' },
          { sha: 'b2c3d4e', title: 'Wire health baseline into the scoring engine' },
          { sha: 'c3d4e5f', title: 'Fix null coalescing on Postgres-backed health store' },
        ],
      },
      { id: 'ev2', summary: '1 commit', repo: 'yourname/weekend-project', timestamp: iso(now, -26), url: '#', branch: 'main', commits: [{ sha: 'd4e5f6a', title: 'Prototype the offline sync queue' }] },
      { id: 'ev3', summary: 'Opened a pull request', repo: 'yourname/nohm', timestamp: iso(now, -20), url: '#' },
      { id: 'ev4', summary: '2 commits', repo: 'yourname/dotfiles', timestamp: iso(now, -50), url: '#', branch: 'main', commits: [{ sha: 'e5f6a7b', title: 'Tidy up shell aliases' }, { sha: 'f6a7b8c', title: 'Add starship prompt config' }] },
    ],
    pullRequests: [
      { title: 'Add importance scoring to the command center', repo: 'yourname/nohm', number: 42, url: '#', role: 'author', draft: false, updatedAt: iso(now, -2), branch: 'importance-scoring', additions: 312, deletions: 47, changedFiles: 9, commits: 6 },
      { title: 'Bump Vite to 7.x', repo: 'yourname/nohm', number: 40, url: '#', role: 'review-requested', draft: false, updatedAt: iso(now, -20), branch: 'deps/vite-7', additions: 58, deletions: 22, changedFiles: 4, commits: 2 },
      { title: 'WIP: offline sync queue', repo: 'yourname/weekend-project', number: 3, url: '#', role: 'author', draft: true, updatedAt: iso(now, -26), branch: 'offline-sync', additions: 140, deletions: 8, changedFiles: 5, commits: 3 },
    ],
    issues: [
      { title: 'Contribution grid should scroll on narrow viewports', repo: 'yourname/nohm', number: 38, url: '#', updatedAt: iso(now, -40) },
      { title: 'Investigate flaky transit test', repo: 'yourname/nohm', number: 35, url: '#', updatedAt: iso(now, -96) },
    ],
    contributions: { total: days.reduce((sum, d) => sum + d.count, 0), days },
    repoHealth: [
      { fullName: 'yourname/nohm', stars: 12, ciStatus: 'success', ciUrl: '#', latestRelease: 'v1.4.0', url: '#', lastPushedAt: iso(now, -3) },
      { fullName: 'yourname/weekend-project', stars: 3, ciStatus: 'running', ciUrl: '#', url: '#', lastPushedAt: iso(now, -26) },
      { fullName: 'yourname/dotfiles', stars: 41, ciStatus: 'none', url: '#', lastPushedAt: iso(now, -14 * 24) },
      { fullName: 'yourname/old-experiment', stars: 2, ciStatus: 'failure', ciUrl: '#', url: '#', lastPushedAt: iso(now, -60 * 24) },
    ],
  };
}

// ── SonarCloud ───────────────────────────────────────────────────────────────────────────────

export function sonarCloud(now: Date): SonarCloudData {
  return {
    projects: [
      { key: 'yourname_nohm', name: 'nohm', visibility: 'public', lastAnalysis: iso(now, -3), qualityGateStatus: 'passed', linesOfCode: 18420, languages: ['TypeScript', 'CSS'], security: 'A', reliability: 'A', maintainability: 'A', hotspotsReviewedPercent: 100, coveragePercent: 78.4, duplicationsPercent: 1.2, vulnerabilitiesCount: 0, bugsCount: 0, codeSmellsCount: 12, newIssuesCount: 0, newCoveragePercent: 86.2, newDuplicationsPercent: 0.4, newHotspotsCount: 0, newHotspotsReviewedPercent: 100 },
      { key: 'yourname_weekend-project', name: 'weekend-project', visibility: 'public', lastAnalysis: iso(now, -26), qualityGateStatus: 'failed', qualityGateConditions: [{ metricKey: 'new_coverage', status: 'failed', comparator: 'LT', errorThreshold: '80', actualValue: '42.1' }, { metricKey: 'new_duplicated_lines_density', status: 'failed', comparator: 'GT', errorThreshold: '3', actualValue: '4.6' }], linesOfCode: 3120, languages: ['TypeScript'], security: 'B', reliability: 'C', maintainability: 'A', hotspotsReviewedPercent: 60, coveragePercent: 42.1, duplicationsPercent: 4.6, vulnerabilitiesCount: 2, bugsCount: 5, codeSmellsCount: 8, newIssuesCount: 3, newCoveragePercent: 42.1, newDuplicationsPercent: 4.6, newHotspotsCount: 2, newHotspotsReviewedPercent: 50 },
      { key: 'yourname_dotfiles', name: 'dotfiles', visibility: 'public', lastAnalysis: iso(now, -14 * 24), qualityGateStatus: 'none', linesOfCode: 640, languages: ['Shell'], duplicationsPercent: 0 },
    ],
  };
}
