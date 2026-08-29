import type { ReactNode } from 'react';
import type { AiUsageToolData, CommandCenterSlot } from '@nohm/shared';
import { UsageSparkline } from '../../../sections/ai/UsageHistoryChart';
import { FIVE_HOUR_MS, WEEKLY_MS } from '../../../sections/ai/UsageMeter';
import type { AiUsageByTool } from '../useCommandCenterData';
import { AiToolMark } from './fallback';

const DAY_MS = 24 * 60 * 60_000;

type AiUsageRender = Extract<CommandCenterSlot['render'], { type: 'ai-usage-tool' }>;

function aiToolColor(toolId: AiUsageRender['toolIds'][number]): string {
  return toolId === 'codex' ? 'var(--color-codex)' : 'var(--color-claude)';
}

/** One sparkline per tool; several overlay in one box — same time window, same fixed 0–100% scale. */
export function AiUsageTrend({ render, aiUsage }: Readonly<{
  render: AiUsageRender;
  aiUsage: AiUsageByTool;
}>): ReactNode {
  const lines = render.toolIds
    .map((toolId) => ({ toolId, data: aiUsage[toolId], history: aiUsage[toolId]?.history }))
    .filter((line): line is { toolId: AiUsageRender['toolIds'][number]; data: AiUsageToolData; history: NonNullable<AiUsageToolData['history']> } =>
      Boolean(line.history?.length));
  if (!lines.length) return null;
  return <div className="relative">
    {lines.map((line, index) => <div key={line.toolId} className={index > 0 ? 'absolute inset-0' : undefined}>
      <UsageSparkline
        points={line.history}
        metric={render.metric === 'fiveHour' ? 'fiveHourUsedPercent' : 'weeklyUsedPercent'}
        windowMs={render.metric === 'fiveHour' ? DAY_MS : WEEKLY_MS}
        color={aiToolColor(line.toolId)}
        sessionResetsAt={render.metric === 'fiveHour' ? line.data.fiveHour?.resetsAt : undefined}
        sessionWindowMs={render.metric === 'fiveHour' ? FIVE_HOUR_MS : undefined}
      />
    </div>)}
  </div>;
}

export function AiUsageSecondary({ slot, aiUsage }: Readonly<{ slot: CommandCenterSlot; aiUsage: AiUsageByTool }>): ReactNode {
  if (slot.render.type !== 'ai-usage-tool') return null;
  const trend = AiUsageTrend({ render: slot.render, aiUsage });
  if (!trend) return null;
  const toolIds = slot.render.toolIds;
  return <div className="command-secondary-ai mt-4">
    <div className="flex shrink-0 flex-col items-center gap-2">
      {toolIds.map((toolId) => <AiToolMark key={toolId} accent={toolId} className="h-10 w-10" />)}
    </div>
    <div className="min-w-0 flex-1">
      <p className="command-hero-title text-sm font-semibold text-ink">{slot.title}</p>
      <div className="mt-2">{trend}</div>
      <p className="mt-1.5 text-[11px] tabular-nums text-ink-faint">{slot.detail}</p>
    </div>
  </div>;
}
