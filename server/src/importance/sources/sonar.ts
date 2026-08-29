import type { SonarCloudData, SonarProject } from '@nohm/shared';
import type { Candidate, SonarMoments } from '../types.js';
import { allShapes } from './shapes.js';

function projectSummary(project: SonarProject | undefined, key: string, name: string) {
  return {
    key,
    name,
    security: project?.security,
    reliability: project?.reliability,
    maintainability: project?.maintainability,
    vulnerabilitiesCount: project?.vulnerabilitiesCount,
    bugsCount: project?.bugsCount,
    codeSmellsCount: project?.codeSmellsCount,
  };
}

/**
 * SonarCloud quality gate transitions detected since the last poll (see computeSonarMoments in
 * commandCenter.ts). A newly-failed gate is a regression worth acting on; a newly-passed one is
 * lower-priority good news, so the two get very different scores. Each carries the project's
 * ratings and issue counts (not just pass/fail) so the card reads like a compact version of the
 * Code quality section, not a bare label.
 */
export function sonarCandidates(data: SonarCloudData | undefined, moments: SonarMoments): Candidate[] {
  if (!data) return [];
  const byKey = new Map(data.projects.map((project) => [project.key, project]));
  const summarize = (change: SonarMoments['changed'][number]) => projectSummary(byKey.get(change.projectKey), change.projectKey, change.projectName);
  const failed = moments.changed.filter((change) => change.status === 'failed');
  const passed = moments.changed.filter((change) => change.status === 'passed');
  const candidates: Candidate[] = [];
  if (failed.length) {
    candidates.push({
      id: `sonar:failed:${failed[0].projectKey}`, source: 'sonar', kind: 'sonar', score: 78, shapes: [...allShapes],
      kicker: 'SonarCloud Quality Gate',
      title: failed[0].projectName, detail: 'SonarCloud', href: '#/github',
      render: { type: 'sonar-quality-gate', status: 'failed', projects: failed.map(summarize) },
    });
  }
  if (passed.length) {
    candidates.push({
      id: `sonar:passed:${passed[0].projectKey}`, source: 'sonar', kind: 'sonar', score: 42, shapes: ['tile'],
      kicker: 'SonarCloud Quality Gate',
      title: passed[0].projectName, detail: 'SonarCloud', href: '#/github',
      render: { type: 'sonar-quality-gate', status: 'passed', projects: passed.map(summarize) },
    });
  }
  return candidates;
}
