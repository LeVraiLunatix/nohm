import { describe, expect, it } from 'vitest';
import type { SonarCloudData } from '@nohm/shared';
import { sonarCandidates } from './sonar.js';

function sonarData(): SonarCloudData {
  return {
    projects: [
      { key: 'proj-a', name: 'Project A', visibility: 'public', qualityGateStatus: 'failed', languages: [] },
      { key: 'proj-b', name: 'Project B', visibility: 'public', qualityGateStatus: 'passed', languages: [] },
    ],
  };
}

describe('sonarCandidates', () => {
  it('surfaces a newly-failed quality gate as a high-score candidate', () => {
    const candidates = sonarCandidates(sonarData(), { changed: [{ projectKey: 'proj-a', projectName: 'Project A', status: 'failed' }] });

    expect(candidates).toContainEqual(expect.objectContaining({
      id: 'sonar:failed:proj-a', score: 78, kicker: 'SonarCloud Quality Gate', title: 'Project A',
      render: { type: 'sonar-quality-gate', status: 'failed', projects: [{ key: 'proj-a', name: 'Project A' }] },
    }));
  });

  it('surfaces a newly-passed quality gate as a lower-score, tile-only candidate', () => {
    const candidates = sonarCandidates(sonarData(), { changed: [{ projectKey: 'proj-b', projectName: 'Project B', status: 'passed' }] });

    expect(candidates).toContainEqual(expect.objectContaining({
      id: 'sonar:passed:proj-b', score: 42, shapes: ['tile'], kicker: 'SonarCloud Quality Gate',
    }));
  });

  it('produces no candidates when nothing changed', () => {
    expect(sonarCandidates(sonarData(), { changed: [] })).toEqual([]);
  });

  it('is empty without data', () => {
    expect(sonarCandidates(undefined, { changed: [] })).toEqual([]);
  });
});
