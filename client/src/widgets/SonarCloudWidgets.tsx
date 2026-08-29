import type { SonarProject, SonarRating } from '@nohm/shared';

const RATING_COLOR: Record<SonarRating, string> = {
  A: 'light-dark(#1c7a3d, #4ade80)',
  B: 'light-dark(#4d8c1f, #a3e635)',
  C: 'light-dark(#b58900, #facc15)',
  D: 'light-dark(#c2600a, #fb923c)',
  E: 'light-dark(#b91c1c, #fb7185)',
};

const QUALITY_GATE_METRIC_LABELS: Record<string, string> = {
  new_violations: 'New issues',
  new_reliability_rating: 'New reliability rating',
  new_security_rating: 'New security rating',
  new_maintainability_rating: 'New maintainability rating',
  new_sqale_rating: 'New maintainability rating',
  new_security_hotspots_reviewed: 'New hotspots reviewed',
  new_coverage: 'New-code coverage',
  new_duplicated_lines_density: 'New-code duplication',
  reliability_rating: 'Reliability rating',
  security_rating: 'Security rating',
  sqale_rating: 'Maintainability rating',
  security_hotspots_reviewed: 'Hotspots reviewed',
  coverage: 'Coverage',
  duplicated_lines_density: 'Duplication',
};

const PERCENT_METRICS = new Set([
  'new_security_hotspots_reviewed',
  'new_coverage',
  'new_duplicated_lines_density',
  'security_hotspots_reviewed',
  'coverage',
  'duplicated_lines_density',
]);

function formatQualityGateValue(metricKey: string, value: string | undefined): string {
  if (value === undefined) return 'unknown';
  if (metricKey.endsWith('_rating')) {
    const ratingIndex = Number(value);
    if (Number.isInteger(ratingIndex) && ratingIndex >= 1 && ratingIndex <= 5) {
      return (['A', 'B', 'C', 'D', 'E'] as const)[ratingIndex - 1] ?? value;
    }
    return value;
  }
  if (!PERCENT_METRICS.has(metricKey)) return value;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toFixed(1)}%` : value;
}

function qualityGateRequirement(metricKey: string, comparator: string, threshold: string | undefined): string | undefined {
  if (threshold === undefined) return undefined;
  const formattedThreshold = formatQualityGateValue(metricKey, threshold);
  if (comparator === 'GT') return `requires ≤ ${formattedThreshold}`;
  if (comparator === 'LT') return `requires ≥ ${formattedThreshold}`;
  if (comparator === 'NE') return `requires ${formattedThreshold}`;
  if (comparator === 'EQ') return `must differ from ${formattedThreshold}`;
  return `threshold ${formattedThreshold}`;
}

function qualityGateConditionText(condition: NonNullable<SonarProject['qualityGateConditions']>[number]): string {
  const label = QUALITY_GATE_METRIC_LABELS[condition.metricKey] ?? condition.metricKey.replaceAll('_', ' ');
  const actual = formatQualityGateValue(condition.metricKey, condition.actualValue);
  const requirement = qualityGateRequirement(condition.metricKey, condition.comparator, condition.errorThreshold);
  return requirement ? `${label}: ${actual} · ${requirement}` : `${label}: ${actual}`;
}

/** Flip to true to bring back the "New code" line under each project card. */
const SHOW_NEW_CODE_SUMMARY: boolean = false;

function NewCodeSummary({ project }: Readonly<{ project: SonarProject }>) {
  const items: string[] = [];
  if (project.newIssuesCount !== undefined) {
    items.push(`${project.newIssuesCount} new issue${project.newIssuesCount === 1 ? '' : 's'}`);
  }
  if (project.newCoveragePercent !== undefined) items.push(`${project.newCoveragePercent.toFixed(1)}% coverage`);
  if (project.newDuplicationsPercent !== undefined) items.push(`${project.newDuplicationsPercent.toFixed(1)}% duplication`);
  if (project.newHotspotsCount === 0) {
    items.push('No new hotspots');
  } else if (project.newHotspotsCount !== undefined && project.newHotspotsReviewedPercent !== undefined) {
    items.push(`${project.newHotspotsReviewedPercent.toFixed(0)}% of ${project.newHotspotsCount} hotspots reviewed`);
  } else if (project.newHotspotsCount !== undefined) {
    items.push(`${project.newHotspotsCount} new hotspot${project.newHotspotsCount === 1 ? '' : 's'}`);
  } else if (project.newHotspotsReviewedPercent !== undefined) {
    items.push(`${project.newHotspotsReviewedPercent.toFixed(0)}% hotspots reviewed`);
  }

  if (items.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-(--color-card-border) pt-3 text-xs text-ink-faint">
      <span className="font-semibold uppercase tracking-[0.1em] text-ink-muted">New code</span>
      {items.map((item) => <span key={item}>· {item}</span>)}
    </div>
  );
}

export function RatingBadge({ rating, label, value, issueCount }: Readonly<{ rating?: SonarRating; label: string; value?: string; issueCount?: number }>) {
  return (
    <div className="flex flex-col items-center justify-center gap-1">
      <div className="flex h-7 items-center justify-center">
        {rating ? (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: RATING_COLOR[rating] }}
          >
            {rating}
          </span>
        ) : (
          <span className="text-sm font-semibold tabular-nums text-ink">{value ?? '–'}</span>
        )}
      </div>
      <span className="text-center text-[9px] font-semibold uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      {issueCount !== undefined && (
        <span className="text-[10px] tabular-nums text-ink-faint">
          {issueCount} issue{issueCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  );
}

function totalIssueCount(project: SonarProject): number | undefined {
  const { vulnerabilitiesCount, bugsCount, codeSmellsCount } = project;
  if (vulnerabilitiesCount === undefined && bugsCount === undefined && codeSmellsCount === undefined) return undefined;
  return (vulnerabilitiesCount ?? 0) + (bugsCount ?? 0) + (codeSmellsCount ?? 0);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatLoc(loc: number | undefined): string {
  if (loc === undefined) return '0';
  if (loc >= 1000) return `${(loc / 1000).toFixed(1)}k`;
  return String(loc);
}

export function SonarProjectCard({ project }: Readonly<{ project: SonarProject }>) {
  const { lastAnalysis } = project;
  const failedConditions = project.qualityGateConditions?.filter((condition) => condition.status === 'failed') ?? [];
  return (
    <a
      href={`https://sonarcloud.io/project/overview?id=${encodeURIComponent(project.key)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-2xl border border-(--color-card-border) bg-track/15 p-4 transition-colors hover:bg-track/25 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-base font-semibold text-ink">{project.name}</p>
          <span className="shrink-0 rounded-full border border-(--color-card-border) px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
            {project.visibility}
          </span>
        </div>
        {project.qualityGateStatus !== 'none' && (
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{
              color: project.qualityGateStatus === 'passed' ? 'light-dark(#0a7a3d, #4ade80)' : 'light-dark(#b91c1c, #fb7185)',
              background: project.qualityGateStatus === 'passed' ? 'color-mix(in oklab, #22c55e 18%, transparent)' : 'color-mix(in oklab, #ef4444 18%, transparent)',
            }}
          >
            {project.qualityGateStatus === 'passed' ? '✓ Passed' : '✕ Failed'}
          </span>
        )}
      </div>
      {lastAnalysis ? (
        <>
          <p className="mt-2 text-xs text-ink-faint">
            Last analysis: {formatDate(lastAnalysis)} · <span className="font-semibold text-ink-muted">{formatLoc(project.linesOfCode)}</span> Lines of Code
            {project.languages.length > 0 && ` · ${project.languages.join(', ')}`}
            {totalIssueCount(project) !== undefined && (
              <>
                {' '}
                · <span className="font-semibold text-ink-muted">{totalIssueCount(project)}</span> issues total
              </>
            )}
          </p>
          {failedConditions.length > 0 && (
            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-ink-muted">
              <p className="font-semibold text-red-700 dark:text-red-300">Why it failed</p>
              <ul className="mt-1 space-y-0.5">
                {failedConditions.map((condition) => (
                  <li key={`${condition.metricKey}:${condition.errorThreshold ?? ''}`}>{qualityGateConditionText(condition)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-(--color-card-border) pt-4 sm:grid-cols-5">
            <RatingBadge rating={project.security} label="Security" issueCount={project.vulnerabilitiesCount} />
            <RatingBadge rating={project.reliability} label="Reliability" issueCount={project.bugsCount} />
            <RatingBadge rating={project.maintainability} label="Maintainability" issueCount={project.codeSmellsCount} />
            <RatingBadge label="Hotspots Reviewed" value={project.hotspotsReviewedPercent !== undefined ? `${project.hotspotsReviewedPercent.toFixed(0)}%` : undefined} />
            {/* Coverage is omitted: SonarCloud only reports it from CI-based analysis with an
                uploaded coverage report, and this repo's CI has no such step yet (Automatic
                Analysis mode can't run tests). Re-add once that's wired up. */}
            <RatingBadge label="Duplications" value={project.duplicationsPercent !== undefined ? `${project.duplicationsPercent.toFixed(1)}%` : '0.0%'} />
          </div>
          {SHOW_NEW_CODE_SUMMARY && <NewCodeSummary project={project} />}
        </>
      ) : (
        <p className="mt-2 text-xs text-ink-faint">No analysis yet</p>
      )}
    </a>
  );
}
