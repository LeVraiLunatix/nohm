import { useMemo, type ReactNode } from 'react';
import type { GitHubData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { rampColor } from '../../lib/contributions';
import { relativeTime } from '../../lib/time';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { CiBadge } from '../../widgets/GitHubWidgets';
import './github.css';

const STRIP_WEEKS = 16;

function repoShortName(fullName: string): string {
  return fullName.split('/')[1] ?? fullName;
}

/** Consecutive days of activity counting back from today; breaks at the first zero day. */
function currentStreak(days: GitHubData['contributions']['days']): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count === 0) break;
    streak++;
  }
  return streak;
}

function ContributionGraph({ days }: Readonly<{ days: GitHubData['contributions']['days'] }>) {
  const weeks = useMemo(() => {
    const all: GitHubData['contributions']['days'][] = [];
    for (let i = 0; i < days.length; i += 7) {
      all.push(days.slice(i, i + 7));
    }
    return all.slice(-STRIP_WEEKS);
  }, [days]);
  const max = Math.max(1, ...weeks.flat().map((day) => day.count));

  return (
    <div className="github-heat-grid">
      {weeks.map((week) => (
        <div key={week[0]?.date ?? 'empty-week'} className="github-heat-week">
          {week.map((day) => (
            <span
              key={day.date}
              className="github-heat-cell"
              style={{ backgroundColor: rampColor(day.count, max) }}
              aria-label={`${day.date}: ${day.count} contributions`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Chip({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="github-chip">{children}</span>;
}

function GitHubOverviewContent({ data }: Readonly<{ data: GitHubData }>) {
  const today = data.contributions.days.at(-1)?.count ?? 0;
  const streak = currentStreak(data.contributions.days);
  const latest = data.activity[0];
  const topRepo = useMemo(() => {
    if (data.repoHealth.length === 0) return undefined;
    const matched = data.repoHealth.find((repo) => repo.fullName === latest?.repo);
    if (matched) return matched;
    return [...data.repoHealth].sort(
      (a, b) => new Date(b.lastPushedAt).getTime() - new Date(a.lastPushedAt).getTime(),
    )[0];
  }, [data.repoHealth, latest?.repo]);

  return (
    <div className="github-overview">
      <div className="github-hero">
        <div className="github-hero-main">
          <span className="github-eyebrow">Contributions past year</span>
          <div className="github-hero-figure">
            <AnimatedNumber value={data.contributions.total} />
          </div>
          <div className="github-hero-substats">
            <span><strong>{today}</strong> today</span>
            <span className="github-hero-dot" aria-hidden>·</span>
            <span><strong>{streak}</strong> day streak</span>
          </div>
        </div>
        <div className="github-hero-graph">
          <ContributionGraph days={data.contributions.days} />
        </div>
      </div>

      <div className="github-chip-row">
        <Chip>
          <strong>{data.pullRequests.length}</strong> open PR{data.pullRequests.length === 1 ? '' : 's'}
        </Chip>
        <Chip>
          <strong>{data.issues.length}</strong> issue{data.issues.length === 1 ? '' : 's'}
        </Chip>
        {topRepo && (
          <span className="github-chip github-chip-repo">
            <a href={topRepo.url} target="_blank" rel="noreferrer" className="github-chip-repo-name">
              {repoShortName(topRepo.fullName)}
            </a>
            <CiBadge status={topRepo.ciStatus} url={topRepo.ciUrl} />
            <span>★ {topRepo.stars}</span>
            {topRepo.latestRelease && <span className="github-chip-release">{topRepo.latestRelease}</span>}
          </span>
        )}
      </div>

      <div className="github-activity">
        <span aria-hidden className="shrink-0">↳</span>
        {latest ? (
          <span className="github-activity-summary">
            {latest.url ? (
              <a href={latest.url} target="_blank" rel="noreferrer">
                {latest.summary}
              </a>
            ) : (
              latest.summary
            )}
            {' · '}
            {repoShortName(latest.repo)}
          </span>
        ) : (
          <span className="github-activity-summary">No repo activity yet</span>
        )}
        {latest && <span className="shrink-0">{relativeTime(latest.timestamp)}</span>}
      </div>
    </div>
  );
}

export function GitHubOverview() {
  const { envelope, offline } = useWidget<GitHubData>('github');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => <GitHubOverviewContent data={data} />}
    </WidgetBody>
  );
}
