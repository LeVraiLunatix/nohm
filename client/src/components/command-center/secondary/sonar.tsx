import type { ReactNode } from 'react';
import type { CommandCenterSlot } from '@nohm/shared';
import { SonarWordmark } from '../../SonarWordmark';
import { RatingBadge } from '../../../widgets/SonarCloudWidgets';

type SonarRender = Extract<CommandCenterSlot['render'], { type: 'sonar-quality-gate' }>;

/** Same pass/fail pill treatment as SonarProjectCard, so a quality-gate moment reads consistently
 * across the Code quality detail section, the command-center secondary card, and its tile. */
export function QualityGatePill({ status }: Readonly<{ status: 'passed' | 'failed' }>): ReactNode {
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        color: status === 'passed' ? 'light-dark(#0a7a3d, #4ade80)' : 'light-dark(#b91c1c, #fb7185)',
        background: status === 'passed' ? 'color-mix(in oklab, #22c55e 18%, transparent)' : 'color-mix(in oklab, #ef4444 18%, transparent)',
      }}
    >
      {status === 'passed' ? '✓ Passed' : '✕ Failed'}
    </span>
  );
}

export function SonarRatingBadges({ project }: Readonly<{ project: SonarRender['projects'][number] }>): ReactNode {
  return (
    <div className="grid grid-cols-3 gap-3">
      <RatingBadge rating={project.security} label="Security" issueCount={project.vulnerabilitiesCount} />
      <RatingBadge rating={project.reliability} label="Reliability" issueCount={project.bugsCount} />
      <RatingBadge rating={project.maintainability} label="Maintainability" issueCount={project.codeSmellsCount} />
    </div>
  );
}

export function SonarQualityGateSecondary({ slot }: Readonly<{ slot: CommandCenterSlot }>): ReactNode {
  if (slot.render.type !== 'sonar-quality-gate') return null;
  const { status, projects } = slot.render;
  const [first, ...rest] = projects;
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <QualityGatePill status={status} />
        <span className="text-sm font-semibold text-ink">{first.name}</span>
      </div>
      <div className="mt-4"><SonarRatingBadges project={first} /></div>
      {rest.length > 0 && (
        <div className="command-agenda-list mt-4">
          {rest.map((project) => (
            <div key={project.key} className="command-agenda-item">
              <SonarWordmark className="command-agenda-lead mr-2.5 inline-block h-[1.05rem] w-auto shrink-0 align-baseline" /><span>{project.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
