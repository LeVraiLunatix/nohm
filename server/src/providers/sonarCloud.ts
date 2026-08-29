import { sonarCloudSchema, type SonarCloudData, type SonarProject, type SonarRating } from '@nohm/shared';
import type { Provider } from '../scheduler.js';

const SONAR_API_BASE = 'https://sonarcloud.io/api';
const MEASURE_KEYS = [
  'ncloc',
  'ncloc_language_distribution',
  'security_rating',
  'reliability_rating',
  'sqale_rating',
  'security_hotspots_reviewed',
  'coverage',
  'duplicated_lines_density',
  'vulnerabilities',
  'bugs',
  'code_smells',
  'new_violations',
  'new_coverage',
  'new_duplicated_lines_density',
  'new_security_hotspots',
  'new_security_hotspots_reviewed',
].join(',');

/** Sonar's language keys aren't display names; only the ones likely to show up in this user's
 * repos are mapped, everything else falls back to its upper-cased key. */
const LANGUAGE_NAMES: Record<string, string> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  css: 'CSS',
  html: 'HTML',
  py: 'Python',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  go: 'Go',
  ruby: 'Ruby',
  php: 'PHP',
  cs: 'C#',
  cpp: 'C++',
  c: 'C',
  json: 'JSON',
  yaml: 'YAML',
  xml: 'XML',
  docker: 'Docker',
  md: 'Markdown',
  web: 'HTML',
};

export interface SonarCloudAuth {
  token: string;
  orgKey: string;
}

interface RawComponent {
  key: string;
  name: string;
  visibility: 'public' | 'private';
  analysisDateAllBranches?: string;
}

interface RawMeasure {
  metric: string;
  value?: string;
  periods?: Array<{ value?: string }>;
}

interface RawQualityGateCondition {
  metricKey: string;
  status: string;
  comparator: string;
  errorThreshold?: string;
  actualValue?: string;
}

interface RawQualityGateStatus {
  projectStatus?: {
    status?: string;
    conditions?: RawQualityGateCondition[];
  };
}

class SonarHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function qualityGateStatus(status: string | undefined): SonarProject['qualityGateStatus'] {
  if (status === 'OK') return 'passed';
  if (status === 'ERROR') return 'failed';
  return 'none';
}

/** Never throws a message containing the URL or the Authorization header — both carry the token. */
async function sonarRequest<T>(signal: AbortSignal, token: string, path: string, label: string): Promise<T> {
  const authorization = Buffer.from(token + ':').toString('base64');
  const res = await fetch(`${SONAR_API_BASE}${path}`, {
    signal,
    headers: { Authorization: `Basic ${authorization}` },
  });
  if (!res.ok) throw new SonarHttpError(`SonarCloud ${label} failed: HTTP ${res.status}`, res.status);
  return (await res.json()) as T;
}

export function toRating(value: string | undefined): SonarRating | undefined {
  const index = value ? Number(value) : undefined;
  if (!index || index < 1 || index > 5) return undefined;
  return (['A', 'B', 'C', 'D', 'E'] as const)[index - 1];
}

export function parseLanguages(distribution: string | undefined): string[] {
  if (!distribution) return [];
  return distribution
    .split(';')
    .map((entry) => entry.split('=')[0])
    .filter((key): key is string => Boolean(key))
    .map((key) => LANGUAGE_NAMES[key] ?? key.toUpperCase());
}

/** Overall measures use `value`; new-code measures use the current entry in `periods`. */
export function measureValue(measure: RawMeasure): string | undefined {
  return measure.value ?? measure.periods?.at(-1)?.value;
}

async function fetchProjectDetails(signal: AbortSignal, token: string, component: RawComponent): Promise<SonarProject> {
  const [qualityGate, measures] = await Promise.all([
    sonarRequest<RawQualityGateStatus>(
      signal,
      token,
      `/qualitygates/project_status?projectKey=${encodeURIComponent(component.key)}`,
      'GetQualityGateStatus',
    ).catch(() => ({ projectStatus: undefined })),
    sonarRequest<{ component?: { measures?: RawMeasure[] } }>(
      signal,
      token,
      `/measures/component?component=${encodeURIComponent(component.key)}&metricKeys=${MEASURE_KEYS}`,
      'GetMeasures',
    ).catch(() => ({ component: undefined })),
  ]);

  const byMetric = new Map((measures.component?.measures ?? []).map((measure) => [measure.metric, measureValue(measure)]));
  const status = qualityGate.projectStatus?.status;

  return {
    key: component.key,
    name: component.name,
    visibility: component.visibility,
    lastAnalysis: component.analysisDateAllBranches,
    qualityGateStatus: qualityGateStatus(status),
    qualityGateConditions: qualityGate.projectStatus?.conditions?.flatMap((condition) => {
      if (condition.status !== 'OK' && condition.status !== 'ERROR') return [];
      return [{
        metricKey: condition.metricKey,
        status: condition.status === 'OK' ? 'passed' as const : 'failed' as const,
        comparator: condition.comparator,
        errorThreshold: condition.errorThreshold,
        actualValue: condition.actualValue,
      }];
    }),
    linesOfCode: byMetric.has('ncloc') ? Number(byMetric.get('ncloc')) : undefined,
    languages: parseLanguages(byMetric.get('ncloc_language_distribution')),
    security: toRating(byMetric.get('security_rating')),
    reliability: toRating(byMetric.get('reliability_rating')),
    maintainability: toRating(byMetric.get('sqale_rating')),
    hotspotsReviewedPercent: byMetric.has('security_hotspots_reviewed') ? Number(byMetric.get('security_hotspots_reviewed')) : undefined,
    coveragePercent: byMetric.has('coverage') ? Number(byMetric.get('coverage')) : undefined,
    duplicationsPercent: byMetric.has('duplicated_lines_density') ? Number(byMetric.get('duplicated_lines_density')) : undefined,
    vulnerabilitiesCount: byMetric.has('vulnerabilities') ? Number(byMetric.get('vulnerabilities')) : undefined,
    bugsCount: byMetric.has('bugs') ? Number(byMetric.get('bugs')) : undefined,
    codeSmellsCount: byMetric.has('code_smells') ? Number(byMetric.get('code_smells')) : undefined,
    newIssuesCount: byMetric.has('new_violations') ? Number(byMetric.get('new_violations')) : undefined,
    newCoveragePercent: byMetric.has('new_coverage') ? Number(byMetric.get('new_coverage')) : undefined,
    newDuplicationsPercent: byMetric.has('new_duplicated_lines_density') ? Number(byMetric.get('new_duplicated_lines_density')) : undefined,
    newHotspotsCount: byMetric.has('new_security_hotspots') ? Number(byMetric.get('new_security_hotspots')) : undefined,
    newHotspotsReviewedPercent: byMetric.has('new_security_hotspots_reviewed') ? Number(byMetric.get('new_security_hotspots_reviewed')) : undefined,
  };
}

export function createSonarCloudProvider(auth: SonarCloudAuth | undefined): Provider<SonarCloudData> {
  return {
    id: 'sonar-cloud',
    schema: sonarCloudSchema,
    refreshMs: 15 * 60_000,
    timeoutMs: 30_000,
    isConfigured: () => auth !== undefined,
    async fetch(signal) {
      if (!auth) throw new Error('sonar-cloud is not configured');

      const search = await sonarRequest<{ components: RawComponent[] }>(
        signal,
        auth.token,
        `/components/search_projects?organization=${encodeURIComponent(auth.orgKey)}&ps=500`,
        'SearchProjects',
      );

      const projects = await Promise.all(search.components.map((component) => fetchProjectDetails(signal, auth.token, component)));

      const data: SonarCloudData = {
        projects: projects.sort((a, b) => (b.lastAnalysis ?? '').localeCompare(a.lastAnalysis ?? '')),
      };

      return sonarCloudSchema.parse(data);
    },
  };
}
