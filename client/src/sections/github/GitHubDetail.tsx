import type { GitHubData, SonarCloudData } from '@nohm/shared';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { WidgetBody } from '../../components/WidgetCard';
import { useWidget } from '../../useWidget';
import {
  ContributionsWidget,
  GitHubActivityWidget,
  GitHubWorkWidget,
  RepoHealthWidget,
} from '../../widgets/GitHubWidgets';
import { SonarProjectCard } from '../../widgets/SonarCloudWidgets';
import { IssueCapture } from './IssueCapture';
import { CodeLauncher } from './CodeLauncher';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';

function SonarSection() {
  const { envelope, offline } = useWidget<SonarCloudData>('sonar-cloud');
  if (envelope?.status === 'disabled') return null;
  return (
    <>
      <DetailSectionHeading title="Code quality" detail="Quality gate status, ratings and coverage across your SonarCloud org." />
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.projects.length === 0 ? (
            <p className="text-sm text-ink-faint">No projects found in this org.</p>
          ) : (
            <div className="space-y-4">
              {data.projects.map((project) => <SonarProjectCard key={project.key} project={project} />)}
            </div>
          )
        }
      </WidgetBody>
    </>
  );
}

function GitHubSignals() {
  const { envelope, offline } = useWidget<GitHubData>('github');
  return (
    <div className="detail-signal-panel">
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) => (
          <div className="grid grid-cols-3 gap-5">
            {[
              [data.contributions.total, 'Year'],
              [data.pullRequests.length, 'Open PRs'],
              [data.issues.length, 'Issues'],
            ].map(([value, label]) => (
              <div key={label}>
                <p className="text-2xl font-semibold tracking-[-0.05em] tabular-nums"><AnimatedNumber value={Number(value)} /></p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-ink-faint">{label}</p>
              </div>
            ))}
          </div>
        )}
      </WidgetBody>
    </div>
  );
}

export function GitHubDetail() {
  return (
    <div>
      <DetailIntro
        title="GitHub activity"
        description="Capture an issue, launch a coding session, or check what's moving across your repos."
        accent="var(--color-accent-github)"
      >
        <GitHubSignals />
      </DetailIntro>
      <DetailSectionHeading title="From thought to working session" detail="Capture quickly or open the full development workspace in one move." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <IssueCapture />
        </div>
        <div className="lg:col-span-2">
          <CodeLauncher />
        </div>
      </div>
      <DetailSectionHeading title="What is moving now" />
      <div className="github-work-grid grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GitHubActivityWidget />
        <GitHubWorkWidget />
        <div className="lg:col-span-2">
          <ContributionsWidget />
        </div>
        <div className="lg:col-span-2">
          <RepoHealthWidget />
        </div>
      </div>
      <SonarSection />
    </div>
  );
}
