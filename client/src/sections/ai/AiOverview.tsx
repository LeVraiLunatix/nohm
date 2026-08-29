import type { AiUsageToolData } from '@nohm/shared';
import { formatCompactNumber } from '../../lib/format';
import { useWidget } from '../../useWidget';
import { isWidgetDisabled, WidgetBody } from '../../components/WidgetCard';
import { FIVE_HOUR_MS, UsageLane, WEEKLY_MS } from './UsageMeter';
import { UsageRefreshButton } from './UsageRefreshButton';
import { AI_TOOLS } from './tools';
import type { ToolIconProps } from './ToolIcons';

function limitLabel(
  limit: AiUsageToolData['fiveHour'],
  status: AiUsageToolData['fiveHourStatus'],
  tokens?: number,
) {
  if (limit) return `${Math.round(limit.usedPercent)}%`;
  if (tokens === 0) return '0%';
  if (tokens !== undefined) return `${formatCompactNumber(tokens)} tokens`;
  return status === 'unlimited' ? 'No limit' : '—';
}

function ToolRow({
  id,
  label,
  color,
  fastColor,
  modelColor,
  iconColor = color,
  icon: Icon,
}: Readonly<{
  id: string;
  label: string;
  color: string;
  fastColor: string;
  modelColor: string;
  iconColor?: string;
  icon: React.ComponentType<ToolIconProps>;
}>) {
  const { envelope, offline, refresh, refreshing } = useWidget<AiUsageToolData>(id);

  if (isWidgetDisabled(envelope)) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: iconColor }} />
        <span className="font-medium">{label}</span>
        <span className="ml-auto">
          <UsageRefreshButton label={label} refreshing={refreshing} onRefresh={refresh} />
        </span>
      </div>
      <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.available ? (
            <div className="space-y-2">
              <UsageLane
                label="5h"
                value={limitLabel(data.fiveHour, data.fiveHourStatus, data.tokens?.fiveHour)}
                percent={data.fiveHour?.usedPercent}
                color={fastColor}
                resetsAt={data.fiveHour?.resetsAt}
                windowMs={FIVE_HOUR_MS}
              />
              <UsageLane
                label="week"
                value={limitLabel(data.weekly, data.weeklyStatus, data.tokens?.weekly)}
                percent={data.weekly?.usedPercent}
                color={color}
                resetsAt={data.weekly?.resetsAt}
                windowMs={WEEKLY_MS}
              />
              {data.modelWeekly && (
                <UsageLane
                  label={data.modelWeekly.model.toLowerCase()}
                  value={`${Math.round(data.modelWeekly.usedPercent)}%`}
                  percent={data.modelWeekly.usedPercent}
                  color={modelColor}
                  resetsAt={data.modelWeekly.resetsAt}
                  windowMs={WEEKLY_MS}
                />
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-faint">No snapshot on this machine.</p>
          )
        }
      </WidgetBody>
    </div>
  );
}

export function AiOverview() {
  return (
    <div className="space-y-4">
      {AI_TOOLS.map((tool) => (
        <ToolRow key={tool.id} {...tool} />
      ))}
    </div>
  );
}
