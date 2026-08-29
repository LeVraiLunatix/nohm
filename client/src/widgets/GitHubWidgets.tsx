import { useEffect, useMemo, useRef, useState } from 'react';
import type { GitHubData } from '@nohm/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';
import { rampColor } from '../lib/contributions';

const linkClass =
  'truncate font-medium text-ink hover:underline';

function ActivitySummary({ item }: Readonly<{ item: GitHubData['activity'][number] }>) {
  if (item.commits && item.commits.length > 0) {
    return <span className="truncate text-ink-faint">{item.branch ?? item.summary}</span>;
  }
  if (item.url) {
    return <a href={item.url} target="_blank" rel="noreferrer" className={linkClass}>{item.summary}</a>;
  }
  return <span className="truncate">{item.summary}</span>;
}

export function GitHubActivityWidget() {
  const { envelope, offline } = useWidget<GitHubData>('github');
  return (
    <WidgetCard title="GitHub activity" envelope={envelope} offline={offline}>
      {(data) => (
        <ul className="space-y-2 text-sm">
          {data.activity.map((item) => (
            <li key={item.id} className="group rounded-xl border border-transparent bg-track/25 px-3 py-2 transition hover:border-card-border hover:bg-track/45">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-ink-muted">
                  {item.repo.split('/')[1] ?? item.repo}
                </span>
                <ActivitySummary item={item} />
                <span className="ml-auto shrink-0 text-xs text-ink-faint">
                  {relativeTime(item.timestamp)}
                </span>
              </div>
              {item.commits && item.commits.length > 0 && (
                <CommitList commits={item.commits} repo={item.repo} />
              )}
            </li>
          ))}
          {data.activity.length === 0 && (
            <li className="text-ink-faint">No recent public activity.</li>
          )}
        </ul>
      )}
    </WidgetCard>
  );
}

function CommitList({
  commits,
  repo,
}: {
  readonly commits: NonNullable<GitHubData['activity'][number]['commits']>;
  readonly repo: string;
}) {
  const visibleCommits = commits.slice(0, 5);
  const remainingCommits = commits.slice(5);

  return (
    <div className="mt-1.5 border-l border-card-border pl-3">
      <ul className="space-y-1.5">
        {visibleCommits.map((commit) => (
          <CommitItem key={commit.sha} commit={commit} repo={repo} />
        ))}
      </ul>
      {remainingCommits.length > 0 && (
        <details className="mt-1.5 text-xs">
          <summary className="cursor-pointer text-ink-faint hover:text-ink-muted">
            Show {remainingCommits.length} more commit{remainingCommits.length === 1 ? '' : 's'}
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {remainingCommits.map((commit) => (
              <CommitItem key={commit.sha} commit={commit} repo={repo} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function CommitItem({
  commit,
  repo,
}: {
  readonly commit: NonNullable<GitHubData['activity'][number]['commits']>[number];
  readonly repo: string;
}) {
  const commitUrl = `https://github.com/${repo}/commit/${commit.sha}`;
  const title = (
    <a href={commitUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-ink-muted hover:underline">
      {commit.title}
    </a>
  );

  if (!commit.description) return <li>{title}</li>;

  return (
    <li>
      {title}
      <details className="mt-0.5">
        <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-muted">
          Show description
        </summary>
        <p className="mt-1 whitespace-pre-wrap text-xs text-ink-faint">{commit.description}</p>
      </details>
    </li>
  );
}

export function GitHubWorkWidget() {
  const { envelope, offline } = useWidget<GitHubData>('github');
  return (
    <WidgetCard title="PRs & issues" envelope={envelope} offline={offline}>
      {(data) => (
        <div className="space-y-3 text-sm">
          <WorkList
            label="Open pull requests"
            empty="No open PRs."
            items={data.pullRequests.map((pr) => ({
              key: `pr-${pr.repo}-${pr.number}`,
              url: pr.url,
              title: `${pr.draft ? '(draft) ' : ''}${pr.title}`,
              meta: `${pr.repo.split('/')[1] ?? pr.repo} #${pr.number}${
                pr.role === 'review-requested' ? ' · review requested' : ''
              }`,
              time: relativeTime(pr.updatedAt),
            }))}
          />
          <WorkList
            label="Assigned issues"
            empty="No assigned issues."
            items={data.issues.map((issue) => ({
              key: `issue-${issue.repo}-${issue.number}`,
              url: issue.url,
              title: issue.title,
              meta: `${issue.repo.split('/')[1] ?? issue.repo} #${issue.number}`,
              time: relativeTime(issue.updatedAt),
            }))}
          />
        </div>
      )}
    </WidgetCard>
  );
}

function WorkList({
  label,
  empty,
  items,
}: {
  readonly label: string;
  readonly empty: string;
  readonly items: { key: string; url: string; title: string; meta: string; time: string }[];
}) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-medium text-ink-faint">{label}</h3>
      {items.length === 0 ? (
        <p className="text-ink-faint">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key} className="rounded-xl bg-track/25 px-3 py-2 leading-tight transition hover:bg-track/45">
              <a href={item.url} target="_blank" rel="noreferrer" className={linkClass}>
                {item.title}
              </a>
              <div className="flex gap-2 text-xs text-ink-faint">
                <span className="truncate">{item.meta}</span>
                <span className="ml-auto shrink-0">{item.time}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ContributionsWidget() {
  const { envelope, offline } = useWidget<GitHubData>('github');
  const [hovered, setHovered] = useState<{ date: string; count: number } | null>(null);

  return (
    <WidgetCard title="Contributions" envelope={envelope} offline={offline}>
      {(data) => <ContributionGrid data={data} hovered={hovered} onHover={setHovered} />}
    </WidgetCard>
  );
}

export function ContributionGrid({
  data,
  hovered,
  onHover,
}: {
  readonly data: GitHubData;
  readonly hovered: { date: string; count: number } | null;
  readonly onHover: (day: { date: string; count: number } | null) => void;
}) {
  const weeks = useMemo(() => {
    const all: GitHubData['contributions']['days'][] = [];
    for (let i = 0; i < data.contributions.days.length; i += 7) {
      all.push(data.contributions.days.slice(i, i + 7));
    }
    return all;
  }, [data]);

  const max = Math.max(1, ...weeks.flat().map((day) => day.count));

  // Full year overflows on phones; start scrolled to the newest weeks.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks.length]);

  const contributionSummary = (() => {
    if (!hovered) return `${data.contributions.total} contributions in the last year`;
    const plural = hovered.count === 1 ? '' : 's';
    return `${hovered.date} · ${hovered.count} contribution${plural}`;
  })();

  return (
    <div>
      <div
        ref={scrollRef}
        className="flex gap-1 overflow-x-auto rounded-2xl bg-track/25 p-3"
        onMouseLeave={() => onHover(null)}
      >
        {weeks.map((week) => (
          <div key={week[0].date} className="flex flex-col gap-1">
            {week.map((day) => (
              <span
                key={day.date}
                className="block h-2.5 w-2.5 rounded-[3px] transition-transform hover:scale-125"
                style={{ backgroundColor: rampColor(day.count, max) }}
                aria-label={`${day.date}: ${day.count} contributions`}
                onMouseEnter={() => onHover(day)}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {contributionSummary}
      </p>
    </div>
  );
}

export function RepoHealthWidget() {
  const { envelope, offline } = useWidget<GitHubData>('github');
  return (
    <WidgetCard title="Repos" envelope={envelope} offline={offline}>
      {(data) => (
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {data.repoHealth.map((repo) => (
            <li key={repo.fullName} className="flex items-center gap-2 rounded-xl bg-track/25 px-3 py-2.5 transition hover:bg-track/45">
              <a href={repo.url} target="_blank" rel="noreferrer" className={linkClass}>
                {repo.fullName.split('/')[1]}
              </a>
              {repo.latestRelease && (
                <span className="text-xs text-ink-faint">
                  {repo.latestRelease}
                </span>
              )}
              <span className="text-xs text-ink-faint">
                updated {relativeTime(repo.lastPushedAt)}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-3 text-xs">
                <span className="text-ink-muted">★ {repo.stars}</span>
                <CiBadge status={repo.ciStatus} url={repo.ciUrl} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// Status colors reserved for state, shipped with icon + label, never color alone.
export function CiBadge({ status, url }: Readonly<{ status: string; url?: string }>) {
  if (status === 'none') {
    return <span className="text-ink-faint">no CI</span>;
  }
  let look: { icon: string; label: string; color?: string } = { icon: '●', label: 'running' };
  if (status === 'success') look = { icon: '✓', label: 'CI', color: '#0ca30c' };
  if (status === 'failure') look = { icon: '✕', label: 'CI', color: '#d03b3b' };
  const badge = (
    <span className="inline-flex items-center gap-1" style={{ color: look.color }}>
      <span aria-hidden>{look.icon}</span>
      {look.label}
    </span>
  );
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
      {badge}
    </a>
  ) : (
    badge
  );
}
