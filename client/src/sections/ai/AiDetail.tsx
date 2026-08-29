import type { AiUsageToolData } from '@nohm/shared';
import { motion } from 'motion/react';
import { relativeTime } from '../../lib/time';
import { formatCompactNumber } from '../../lib/format';
import { useWidget } from '../../useWidget';
import { isWidgetDisabled, StaleBadge, WidgetBody, WidgetShell } from '../../components/WidgetCard';
import { FIVE_HOUR_MS, UsageMeter, WEEKLY_MS, ZeroUsageMeter } from './UsageMeter';
import { UsageHistoryChart } from './UsageHistoryChart';
import { UsageRefreshButton } from './UsageRefreshButton';
import { AI_TOOLS } from './tools';
import type { ToolIconProps } from './ToolIcons';
import { AiNews } from './AiNews';
import { DetailIntro, DetailSectionHeading } from '../DetailIntro';

const DAY_MS = 24 * 60 * 60_000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

/** Fallback for when the account-wide quota (behind a flaky, tightly rate-limited endpoint) isn't available. */
function TokenRow({ label, tokens }: Readonly<{ label: string; tokens: number }>) {
  return (
    <div className="flex items-baseline text-xs">
      <span className="text-ink-muted">{label}</span>
      <span className="ml-auto font-semibold tabular-nums">{formatCompactNumber(tokens)} tokens</span>
    </div>
  );
}

function WindowUnavailable({
  label,
  status,
  tokens,
  color,
}: Readonly<{
  label: string;
  status: AiUsageToolData['fiveHourStatus'];
  tokens?: number;
  color: string;
}>) {
  if (status === 'unlimited') {
    return (
      <div className="flex items-baseline text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="ml-auto font-semibold text-emerald-400">Temporarily unlimited</span>
        {tokens !== undefined && <span className="ml-2 tabular-nums text-ink-faint">{formatCompactNumber(tokens)} tokens</span>}
      </div>
    );
  }
  if (tokens === 0) return <ZeroUsageMeter label={label} color={color} />;
  return tokens !== undefined ? <TokenRow label={label} tokens={tokens} /> : null;
}

function ToolCard({
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
    <motion.div
      className={`ai-tool-panel${id === 'ai-usage-codex' ? ' ai-tool-panel--codex' : ''}`}
      style={{ '--tool-color': color } as React.CSSProperties}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <WidgetShell
        title={label}
        icon={<Icon className="h-3.5 w-3.5 shrink-0" style={{ color: iconColor }} />}
        badge={
          <div className="flex items-center gap-2">
            <StaleBadge envelope={envelope} />
            <UsageRefreshButton label={label} refreshing={refreshing} onRefresh={refresh} />
          </div>
        }
      >
        <WidgetBody envelope={envelope} offline={offline}>
        {(data) =>
          data.available ? (
            <div className="space-y-4">
              {data.fiveHour ? (
                <UsageMeter
                  label="5 hours"
                  limit={data.fiveHour}
                  tokens={data.tokens?.fiveHour}
                  color={fastColor}
                  windowMs={FIVE_HOUR_MS}
                />
              ) : (
                <WindowUnavailable label="5 hours" status={data.fiveHourStatus} tokens={data.tokens?.fiveHour} color={fastColor} />
              )}
              {data.weekly ? (
                <UsageMeter
                  label="Weekly"
                  limit={data.weekly}
                  tokens={data.tokens?.weekly}
                  color={color}
                  windowMs={WEEKLY_MS}
                />
              ) : (
                <WindowUnavailable label="Weekly" status={data.weeklyStatus} tokens={data.tokens?.weekly} color={color} />
              )}
              {data.modelWeekly && (
                <UsageMeter
                  label={`Weekly (${data.modelWeekly.model})`}
                  limit={data.modelWeekly}
                  color={modelColor}
                  windowMs={WEEKLY_MS}
                />
              )}
              {/* Each trend is gated on its window being currently enforced, so a lifted
                  limit (e.g. Codex's 5-hour) doesn't keep charting stale history. */}
              {data.fiveHour && (
                <UsageHistoryChart
                  points={data.history}
                  metric="fiveHourUsedPercent"
                  windowMs={WEEK_MS}
                  color={fastColor}
                  caption="5-hour window · last 7 d"
                  sessionResetsAt={data.fiveHour.resetsAt}
                  sessionWindowMs={FIVE_HOUR_MS}
                />
              )}
              {data.weekly && (
                <UsageHistoryChart
                  points={data.history}
                  metric="weeklyUsedPercent"
                  windowMs={MONTH_MS}
                  color={color}
                  caption="Weekly window · last 30 d"
                  sessionResetsAt={data.weekly.resetsAt}
                  sessionWindowMs={WEEKLY_MS}
                />
              )}
              {data.modelWeekly && (
                <UsageHistoryChart
                  points={data.history}
                  metric="modelWeeklyUsedPercent"
                  windowMs={WEEKLY_MS}
                  color={modelColor}
                  caption={`${data.modelWeekly.model} weekly · last 7 d`}
                />
              )}
              {data.asOf && <p className="text-[11px] text-ink-faint">As of {relativeTime(data.asOf)}</p>}
            </div>
          ) : (
            <p className="text-xs text-ink-faint">No current limit snapshot available on this machine.</p>
          )
        }
        </WidgetBody>
      </WidgetShell>
    </motion.div>
  );
}

export function AiDetail() {
  return (
    <div>
      <DetailIntro
        title="AI usage"
        description="How much of your AI usage allowance is left, and how fast you're using it."
        accent="var(--color-accent-ai)"
      />
      <DetailSectionHeading title="Usage by tool" detail="Context usage is read locally. Account quota updates on a slower cadence." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {AI_TOOLS.map((tool) => <ToolCard key={tool.id} {...tool} />)}
      </div>
      <DetailSectionHeading title="AI news" detail="Official OpenAI and Anthropic announcements, polled every 30 minutes." />
      <AiNews scrollable />
    </div>
  );
}
