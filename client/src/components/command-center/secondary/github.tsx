import type { ReactNode } from 'react';
import type { CommandCenterSlot, GitHubData } from '@nohm/shared';
import { relativeTime } from '../../../lib/time';
import { ContributionGrid } from '../../../widgets/GitHubWidgets';

export function GithubContributionsSecondary({
  slot,
  github,
  hoveredDay,
  onHover,
}: Readonly<{
  slot: CommandCenterSlot;
  github: GitHubData | undefined;
  hoveredDay: { date: string; count: number } | null;
  onHover: (day: { date: string; count: number } | null) => void;
}>): ReactNode {
  if (slot.render.type !== 'github-contributions' || !github) return null;
  return <div className="mt-4"><ContributionGrid data={github} hovered={hoveredDay} onHover={onHover} /></div>;
}

type PullRequest = GitHubData['pullRequests'][number];

/** Diff shape for the headline PR — additions/deletions/files/commits all come from a per-PR
 * detail fetch (see server/src/providers/github.ts), so any of them can be absent. */
function PrDiffStats({ pr }: Readonly<{ pr: PullRequest }>): ReactNode {
  const hasDiff = pr.additions !== undefined && pr.deletions !== undefined;
  if (!hasDiff && pr.changedFiles === undefined && pr.commits === undefined) return null;
  return (
    <p className="mt-2 flex items-center gap-3 text-xs tabular-nums text-ink-faint">
      {hasDiff && (
        <span>
          <span style={{ color: 'light-dark(#0a7a3d, #4ade80)' }}>+{pr.additions}</span>{' '}
          <span style={{ color: 'light-dark(#b91c1c, #fb7185)' }}>-{pr.deletions}</span>
        </span>
      )}
      {pr.changedFiles !== undefined && <span>{pr.changedFiles} file{pr.changedFiles === 1 ? '' : 's'}</span>}
      {pr.commits !== undefined && <span>{pr.commits} commit{pr.commits === 1 ? '' : 's'}</span>}
    </p>
  );
}

/** Repo, branch, updated-time, and diff stats for a PR — everything about it besides its title.
 * Exported so the hero card can show this same meta line under its own (larger) title instead of
 * duplicating the title a second time via the full `PrHeadline` below. */
export function PrMeta({ pr }: Readonly<{ pr: PullRequest }>): ReactNode {
  return (
    <>
      <p className="text-xs text-ink-muted">
        {pr.repo}
        {pr.branch && <> · <span className="font-mono">{pr.branch}</span></>}
        {' · '}Updated {relativeTime(pr.updatedAt)}
      </p>
      <PrDiffStats pr={pr} />
    </>
  );
}

/** Prominent single-PR headline — title plus `PrMeta` — for whichever PR leads the card. Kept
 * separate from the thin-row list below it, which is deliberately compact for the overflow. */
function PrHeadline({ pr }: Readonly<{ pr: PullRequest }>): ReactNode {
  return (
    <div className="mt-4">
      <a href={pr.url} className="command-pr-link text-sm font-semibold text-ink">
        {pr.title} <span className="font-normal text-ink-faint">#{pr.number}</span>
      </a>
      <div className="mt-1"><PrMeta pr={pr} /></div>
    </div>
  );
}

export function GithubReviewList({ github, skip = 0 }: Readonly<{ github: GitHubData | undefined; skip?: number }>): ReactNode {
  const reviews = github?.pullRequests.filter((pr) => pr.role === 'review-requested').slice(skip, skip + 4) ?? [];
  if (!reviews.length) return null;
  return <div className="command-agenda-list mt-4">
    {reviews.map((pr) => <a key={`${pr.repo}#${pr.number}`} href={pr.url} className="command-agenda-item command-pr-link">
      <span className="command-agenda-lead">{pr.repo}</span><span>{pr.title}</span>
    </a>)}
  </div>;
}

export function GithubReviewsSecondary({ slot, github }: Readonly<{ slot: CommandCenterSlot; github: GitHubData | undefined }>): ReactNode {
  if (slot.render.type !== 'github-reviews') return null;
  const reviews = github?.pullRequests.filter((pr) => pr.role === 'review-requested') ?? [];
  if (!reviews.length) return null;
  const [first] = reviews;
  return <><PrHeadline pr={first} /><GithubReviewList github={github} skip={1} /></>;
}

export function GithubOpenPrList({ github, skip = 0 }: Readonly<{ github: GitHubData | undefined; skip?: number }>): ReactNode {
  const openPrs = github?.pullRequests.filter((pr) => pr.role === 'author' && !pr.draft).slice(skip, skip + 4) ?? [];
  if (!openPrs.length) return null;
  return <div className="command-agenda-list mt-4">
    {openPrs.map((pr) => <a key={`${pr.repo}#${pr.number}`} href={pr.url} className="command-agenda-item command-pr-link">
      <span className="command-agenda-lead">{pr.repo}</span><span>{pr.title}</span>
    </a>)}
  </div>;
}

export function GithubOpenPrsSecondary({ slot, github }: Readonly<{ slot: CommandCenterSlot; github: GitHubData | undefined }>): ReactNode {
  if (slot.render.type !== 'github-open-prs') return null;
  const openPrs = github?.pullRequests.filter((pr) => pr.role === 'author' && !pr.draft) ?? [];
  if (!openPrs.length) return null;
  const [first] = openPrs;
  return <><PrHeadline pr={first} /><GithubOpenPrList github={github} skip={1} /></>;
}
