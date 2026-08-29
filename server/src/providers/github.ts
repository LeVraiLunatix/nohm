import { Octokit } from 'octokit';
import { githubSchema, type GitHubData } from '@nohm/shared';
import type { GitHubSnapshotStore } from '../githubSnapshot.js';
import type { Provider } from '../scheduler.js';

export interface RawEvent {
  id: string;
  type: string | null;
  repo: { name: string };
  created_at: string | null;
  payload: {
    commits?: { sha: string; message: string }[];
    action?: string;
    ref?: string | null;
    before?: string;
    head?: string;
    ref_type?: string;
    pull_request?: { number: number; html_url: string };
    issue?: { number: number; html_url: string };
    release?: { tag_name: string; html_url: string };
  };
}

type ActivityCommit = { sha: string; title: string; description?: string };

function toActivityCommit(commit: { sha: string; message: string }): ActivityCommit | undefined {
  const [firstLine, ...remainingLines] = commit.message.split(/\r?\n/);
  const title = firstLine.trim();
  if (!title) return undefined;

  const description = remainingLines.join('\n').trim();
  return {
    sha: commit.sha,
    title,
    ...(description ? { description } : {}),
  };
}

export function describeEvent(
  event: RawEvent,
): {
  summary: string;
  url?: string;
  branch?: string;
  commits?: ActivityCommit[];
} | undefined {
  const p = event.payload;
  switch (event.type) {
    case 'PushEvent': {
      const branch = p.ref?.replace('refs/heads/', '');
      // The events API carries each full commit message inline.
      const commits = (p.commits ?? [])
        .map(toActivityCommit)
        .filter((commit): commit is ActivityCommit => commit !== undefined);
      if (commits.length === 0) {
        return { summary: branch ? `pushed to ${branch}` : 'pushed', branch };
      }
      return {
        summary: `${commits.length} commit${commits.length === 1 ? '' : 's'}`,
        branch,
        commits,
      };
    }
    case 'PullRequestEvent':
      return {
        summary: `${p.action} PR #${p.pull_request?.number}`,
        url: p.pull_request?.html_url,
      };
    case 'IssuesEvent':
      return { summary: `${p.action} issue #${p.issue?.number}`, url: p.issue?.html_url };
    case 'IssueCommentEvent':
      return { summary: `commented on #${p.issue?.number}`, url: p.issue?.html_url };
    case 'CreateEvent': {
      const reference = p.ref ? ` ${p.ref}` : '';
      return { summary: `created ${p.ref_type}${reference}` };
    }
    case 'ReleaseEvent':
      return { summary: `released ${p.release?.tag_name}`, url: p.release?.html_url };
    default:
      return undefined;
  }
}

interface SearchItem {
  title: string;
  number: number;
  html_url: string;
  draft?: boolean;
  updated_at: string;
  repository_url: string;
}

const repoFromApiUrl = (url: string) => url.replace('https://api.github.com/repos/', '');

export type GitHubAuth = { token: string; username: string };

/** Owned, non-fork, non-archived repos — the live replacement for a hand-maintained pinned-repo allowlist. */
export async function listOwnedRepos(auth: GitHubAuth): Promise<string[]> {
  const octokit = new Octokit({ auth: auth.token });
  const repos = await octokit.paginate('GET /user/repos', {
    affiliation: 'owner',
    sort: 'updated',
    per_page: 100,
  });
  return repos.filter((repo) => !repo.fork && !repo.archived).map((repo) => repo.full_name);
}

/**
 * Keeps Issue Capture usable through a short-lived GitHub API outage without
 * treating the cached result as an authorization source for issue creation.
 */
export function createOwnedReposCache(
  fetchOwnedRepos: (auth: GitHubAuth) => Promise<string[]> = listOwnedRepos,
): (auth: GitHubAuth) => Promise<{ repos: string[]; stale: boolean }> {
  let lastGoodRepos: string[] | undefined;

  return async (auth) => {
    try {
      const repos = await fetchOwnedRepos(auth);
      lastGoodRepos = repos;
      return { repos, stale: false };
    } catch (error) {
      if (lastGoodRepos) return { repos: lastGoodRepos, stale: true };
      throw error;
    }
  };
}

const CONTRIBUTIONS_QUERY = `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

interface ContributionsResponse {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        totalContributions: number;
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
  };
}

function ciStatusFor(run: { status: string | null; conclusion: string | null } | undefined) {
  if (!run) return 'none' as const;
  if (run.status !== 'completed') return 'running' as const;
  return run.conclusion === 'success' ? 'success' as const : 'failure' as const;
}

function activitySummary(commits: ActivityCommit[] | undefined, fallback: string): string {
  if (!commits?.length) return fallback;
  const suffix = commits.length === 1 ? '' : 's';
  return `${commits.length} commit${suffix}`;
}

export function createGitHubProvider(
  auth: { token: string; username: string } | undefined,
  snapshotStore?: GitHubSnapshotStore,
): Provider<GitHubData> {
  return {
    id: 'github',
    schema: githubSchema,
    refreshMs: 10 * 60_000,
    timeoutMs: 20_000,
    isConfigured: () => auth !== undefined,
    loadCached: () => snapshotStore?.getSnapshot() ?? Promise.resolve(undefined),
    async fetch(signal) {
      if (!auth) throw new Error('github is not configured');
      const octokit = new Octokit({ auth: auth.token });
      const request = { signal };

      const search = (q: string) =>
        octokit.request('GET /search/issues', {
          q,
          advanced_search: 'true',
          per_page: 15,
          sort: 'updated',
          request,
        });

      const [events, authored, reviewRequested, assignedIssues, contributions, ownedRepos] =
        await Promise.all([
          octokit.request('GET /users/{username}/events', {
            username: auth.username,
            per_page: 40,
            request,
          }),
          search(`is:pr is:open author:${auth.username} archived:false`),
          search(`is:pr is:open review-requested:${auth.username} archived:false`),
          search(`is:issue is:open assignee:${auth.username} archived:false`),
          octokit.graphql<ContributionsResponse>(CONTRIBUTIONS_QUERY, {
            login: auth.username,
            request,
          }),
          listOwnedRepos(auth),
        ]);

      const health = await Promise.all(
        ownedRepos.map(async (fullName) => {
          const [owner, repo] = fullName.split('/');
          const [repoInfo, runs, release] = await Promise.all([
            octokit.request('GET /repos/{owner}/{repo}', { owner, repo, request }),
            octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
              owner,
              repo,
              per_page: 1,
              request,
            }),
            octokit
              .request('GET /repos/{owner}/{repo}/releases/latest', { owner, repo, request })
              .catch(() => undefined),
          ]);
          const run = runs.data.workflow_runs[0];
          const ciStatus = ciStatusFor(run);
          return {
            fullName,
            stars: repoInfo.data.stargazers_count,
            ciStatus,
            ciUrl: run?.html_url,
            latestRelease: release?.data.tag_name,
            url: repoInfo.data.html_url,
            lastPushedAt: repoInfo.data.pushed_at ?? repoInfo.data.created_at,
          };
        }),
      );

      const activityCandidates = (events.data as RawEvent[])
        .map((event) => {
          const described = describeEvent(event);
          return { event, described };
        })
        .filter(
          (
            entry,
          ): entry is {
            event: RawEvent & { created_at: string };
            described: NonNullable<ReturnType<typeof describeEvent>>;
          } => entry.described !== undefined && entry.event.created_at !== null,
        )
        .slice(0, 12);

      const activity = await Promise.all(
        activityCandidates.map(async ({ event, described }) => {
          let commits = described.commits;
          if (!commits && event.type === 'PushEvent' && event.payload.before && event.payload.head) {
            const [owner, repo] = event.repo.name.split('/');
            if (owner && repo) {
              const comparison = await octokit
                .request('GET /repos/{owner}/{repo}/compare/{basehead}', {
                  owner,
                  repo,
                  basehead: `${event.payload.before}...${event.payload.head}`,
                  request,
                })
                .catch(() => undefined);
              commits = comparison?.data.commits
                .map((commit) => toActivityCommit({ sha: commit.sha, message: commit.commit.message }))
                .filter((commit): commit is ActivityCommit => commit !== undefined);
            }
          }

          return {
            id: event.id,
            summary: activitySummary(commits, described.summary),
            repo: event.repo.name,
            timestamp: event.created_at,
            url: described.url,
            branch: described.branch,
            commits,
          };
        }),
      );

      // The search/issues listing above is cheap but doesn't carry a PR's branch or diff size —
      // that only comes from the full PR resource, one extra call per open PR. Bounded by how many
      // PRs are actually open (typically a handful), same tradeoff as the per-repo health calls above.
      const toPr = async (item: SearchItem, role: 'author' | 'review-requested') => {
        const repo = repoFromApiUrl(item.repository_url);
        const [owner, repoName] = repo.split('/');
        const details = owner && repoName
          ? await octokit
              .request('GET /repos/{owner}/{repo}/pulls/{pull_number}', { owner, repo: repoName, pull_number: item.number, request })
              .catch(() => undefined)
          : undefined;
        return {
          title: item.title,
          repo,
          number: item.number,
          url: item.html_url,
          role,
          draft: item.draft ?? false,
          updatedAt: item.updated_at,
          branch: details?.data.head?.ref,
          additions: details?.data.additions,
          deletions: details?.data.deletions,
          changedFiles: details?.data.changed_files,
          commits: details?.data.commits,
        };
      };

      const calendar = contributions.user.contributionsCollection.contributionCalendar;

      const data: GitHubData = {
        activity,
        pullRequests: [
          ...(await Promise.all((authored.data.items as SearchItem[]).map((item) => toPr(item, 'author')))),
          ...(await Promise.all((reviewRequested.data.items as SearchItem[]).map((item) => toPr(item, 'review-requested')))),
        ],
        issues: (assignedIssues.data.items as SearchItem[]).map((item) => ({
          title: item.title,
          repo: repoFromApiUrl(item.repository_url),
          number: item.number,
          url: item.html_url,
          updatedAt: item.updated_at,
        })),
        contributions: {
          total: calendar.totalContributions,
          days: calendar.weeks.flatMap((week) =>
            week.contributionDays.map((day) => ({
              date: day.date, // date-only string, passed through untouched
              count: day.contributionCount,
            })),
          ),
        },
        repoHealth: health,
      };
      // Best-effort: a dropped snapshot write must not blank data the GitHub API already gave us.
      await snapshotStore?.setSnapshot(data).catch(() => undefined);
      return data;
    },
  };
}
