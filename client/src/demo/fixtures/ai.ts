import type { AiUsageToolData } from '@nohm/shared';
import { usageHistoryFor } from '@nohm/shared';

// ── AI usage (Claude / Codex) ────────────────────────────────────────────────────────────────

export function aiUsage(now: Date): { claude: AiUsageToolData; codex: AiUsageToolData } {
  const nowMs = now.getTime();
  const isoFrom = (hoursFromNow: number) => new Date(nowMs + hoursFromNow * 3_600_000).toISOString();

  const claudeFiveHour = { usedPercent: 96, resetsAt: isoFrom(2) };
  const claudeWeekly = { usedPercent: 61, resetsAt: isoFrom(90) };
  const claude: AiUsageToolData = {
    available: true, fiveHour: claudeFiveHour, weekly: claudeWeekly,
    fiveHourStatus: 'limited', weeklyStatus: 'limited',
    tokens: { fiveHour: 812_000, weekly: 4_260_000 }, asOf: isoFrom(0),
    history: usageHistoryFor(claudeFiveHour, claudeWeekly, 1, nowMs),
  };

  const codexFiveHour = { usedPercent: 22, resetsAt: isoFrom(3) };
  const codexWeekly = { usedPercent: 38, resetsAt: isoFrom(90) };
  const codex: AiUsageToolData = {
    available: true, fiveHour: codexFiveHour, weekly: codexWeekly,
    fiveHourStatus: 'limited', weeklyStatus: 'limited',
    tokens: { fiveHour: 305_000, weekly: 1_870_000 }, asOf: isoFrom(0),
    history: usageHistoryFor(codexFiveHour, codexWeekly, 2, nowMs),
  };

  return { claude, codex };
}
