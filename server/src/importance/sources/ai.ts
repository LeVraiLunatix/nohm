import type { AiUsageToolData, UsageHistoryPoint } from '@nohm/shared';

import { computeDeviation } from '../../deviation.js';
import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

export interface AiTool {
  id: string;
  label: string;
  data: AiUsageToolData | undefined;
}

type AiAccent = 'claude' | 'codex';

function aiAccent(tool: AiTool): AiAccent | undefined {
  return tool.id === 'claude' || tool.id === 'codex' ? tool.id : undefined;
}

/** A weekly window that just rolled over reads as a big same-sample drop, not a gradual decline. */
const RESET_DROP_PERCENT = 40;

/**
 * "09:00" when it lands today, "Thu 09:00" later in the week, "Wed 23 Jul" when it's near a full
 * week out — a bare weekday that far ahead reads as tomorrow, not seven days from now.
 */
function resetLabel(resetsAt: string, now = Date.now()): string {
  const reset = new Date(resetsAt);
  const time = reset.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (reset.toDateString() === new Date(now).toDateString()) return time;
  if (reset.getTime() - now >= 6 * 24 * 60 * 60_000) {
    return reset.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  return `${reset.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
}

function aiUsageRender(accents: (AiAccent | undefined)[], metric: 'fiveHour' | 'weekly'): Candidate['render'] {
  const toolIds = accents.filter((accent): accent is AiAccent => accent !== undefined);
  return toolIds.length ? { type: 'ai-usage-tool', toolIds, metric } : { type: 'text' };
}

function aiRunwayCandidate(available: AiTool[]): Candidate | undefined {
  const limits = available.flatMap((tool) => {
    const data = tool.data!;
    return [
      data.fiveHour && { label: tool.label, period: '5-hour limit', metric: 'fiveHour' as const, window: data.fiveHour, accent: aiAccent(tool) },
      data.weekly && { label: tool.label, period: 'weekly limit', metric: 'weekly' as const, window: data.weekly, accent: aiAccent(tool) },
      data.modelWeekly && { label: `${tool.label} ${data.modelWeekly.model}`, period: 'weekly limit', metric: 'weekly' as const, window: data.modelWeekly, accent: aiAccent(tool) },
    ].filter((limit): limit is { label: string; period: string; metric: 'fiveHour' | 'weekly'; window: NonNullable<typeof data.fiveHour>; accent: AiAccent | undefined } => Boolean(limit));
  });
  if (!limits.length) return undefined;

  const tightest = limits.reduce(
    (lowest, limit) => limit.window.usedPercent > lowest.window.usedPercent ? limit : lowest,
    limits[0]!,
  );
  const remaining = Math.max(0, Math.round(100 - tightest.window.usedPercent));
  return {
    id: 'ai-usage:runway', source: 'ai-usage', kind: 'ai-usage', score: remaining <= 15 ? 86 : 30,
    shapes: remaining <= 15 ? [...allShapes] : ['tile'], kicker: remaining <= 15 ? 'Running low' : 'AI runway',
    title: `${remaining}% available`, detail: `${tightest.label} · ${tightest.period} · resets ${resetLabel(tightest.window.resetsAt)}`,
    href: '#/ai', accent: tightest.accent, meter: remaining, render: aiUsageRender([tightest.accent], tightest.metric),
  };
}

interface WeeklyReset {
  tool: AiTool;
  /** Post-reset weekly percent. */
  usedPercent: number;
  drop: number;
  resetsAt: string | undefined;
  /** Present when the drop arrived before the preceding sample's weekly deadline. */
  expectedResetsAt: string | undefined;
}

interface FiveHourReset {
  tool: AiTool;
  /** Post-reset five-hour percent. */
  usedPercent: number;
  /** The reset deadline reported before the allowance rolled over, when known. */
  expectedResetsAt: string | undefined;
}

function weeklyReset(tool: AiTool): WeeklyReset | undefined {
  const data = tool.data!;
  const last = data.history.at(-1);
  const prev = data.history.at(-2);
  if (last?.weeklyUsedPercent === undefined || prev?.weeklyUsedPercent === undefined) return undefined;
  const drop = prev.weeklyUsedPercent - last.weeklyUsedPercent;
  // A confirmed zero after any positive sample is a reset even when a light-use account did not
  // have enough percentage to cross the usual large-drop threshold.
  if (last.weeklyUsedPercent !== 0 && drop < RESET_DROP_PERCENT) return undefined;
  // Some providers zero the percentage before rolling resetsAt forward — an expired timestamp
  // isn't a clean-slate horizon, so treat it as unknown rather than saying "until <yesterday>".
  const resetsAt = data.weekly && Date.parse(data.weekly.resetsAt) > Date.now() ? data.weekly.resetsAt : undefined;
  const expectedAt = prev.weeklyResetsAt && Date.parse(prev.weeklyResetsAt);
  const resetArrivedEarly = expectedAt && Date.parse(last.at) < expectedAt;
  return {
    tool, usedPercent: last.weeklyUsedPercent, drop, resetsAt,
    expectedResetsAt: resetArrivedEarly ? prev.weeklyResetsAt : undefined,
  };
}

/**
 * A sampled zero after positive use is an observed reset, not an interpolated decline. Retain the
 * large-drop fallback too: some providers report a new window a few percent above zero already.
 */
function fiveHourReset(tool: AiTool): FiveHourReset | undefined {
  const data = tool.data!;
  const last = data.history.at(-1);
  const prev = data.history.at(-2);
  if (
    last?.fiveHourUsedPercent === undefined
    || prev?.fiveHourUsedPercent === undefined
  ) return undefined;

  const droppedBy = prev.fiveHourUsedPercent - last.fiveHourUsedPercent;
  if (last.fiveHourUsedPercent !== 0 && droppedBy < RESET_DROP_PERCENT) return undefined;
  const expectedAt = prev.fiveHourResetsAt && Date.parse(prev.fiveHourResetsAt);
  const observedAt = Date.parse(last.at);
  const resetArrivedEarly = expectedAt && Number.isFinite(expectedAt) && observedAt < expectedAt;

  return { tool, usedPercent: last.fiveHourUsedPercent, expectedResetsAt: resetArrivedEarly ? prev.fiveHourResetsAt : undefined };
}

function fiveHourResetCandidates(available: AiTool[]): Candidate[] {
  return available.flatMap((tool) => {
    const reset = fiveHourReset(tool);
    if (!reset) return [];
    return [{
      id: `ai-usage:five-hour-reset:${tool.id}`, source: 'ai-usage', kind: 'ai-usage', score: 65,
      shapes: ['secondary', 'tile'], kicker: 'Fresh allowance',
      title: `${tool.label} 5-hour usage ${reset.expectedResetsAt ? 'reset early' : 'just reset'}`,
      detail: reset.expectedResetsAt
        ? `Back down to ${reset.usedPercent.toFixed(0)}% · expected ${resetLabel(reset.expectedResetsAt)}`
        : `Back down to ${reset.usedPercent.toFixed(0)}% of the 5-hour limit`,
      href: '#/ai', accent: aiAccent(tool), render: aiUsageRender([aiAccent(tool)], 'fiveHour'),
    }];
  });
}

/**
 * Weekly windows roll over on fixed schedules, so both tools resetting in the same sample is
 * systematic, not coincidence — and the ranker only ever seats one ai-usage candidate per board.
 * Merging keeps the second tool's reset from being silently dropped every week.
 */
function aiResetCandidates(available: AiTool[]): Candidate[] {
  const resets = available
    .map(weeklyReset)
    .filter((reset): reset is WeeklyReset => reset !== undefined);
  if (!resets.length) return [];
  if (resets.length === 1) {
    const reset = resets[0]!;
    let detail: string;
    if (reset.expectedResetsAt) {
      detail = `Back down to ${reset.usedPercent.toFixed(0)}% · expected ${resetLabel(reset.expectedResetsAt)}`;
    } else if (reset.resetsAt) {
      detail = `Back down to ${reset.usedPercent.toFixed(0)}% · clean slate until ${resetLabel(reset.resetsAt)}`;
    } else {
      detail = `Back down to ${reset.usedPercent.toFixed(0)}% of the weekly limit`;
    }
    return [{
      id: `ai-usage:reset:${reset.tool.id}`, source: 'ai-usage', kind: 'ai-usage', score: 65,
      shapes: ['secondary', 'tile'], kicker: 'Fresh allowance',
      title: `${reset.tool.label} usage ${reset.expectedResetsAt ? 'reset early' : 'just reset'}`,
      detail,
      href: '#/ai', accent: aiAccent(reset.tool), render: aiUsageRender([aiAccent(reset.tool)], 'weekly'),
    }];
  }
  // Both resets landed within one sampling gap, so the next weekly resets normally all but
  // coincide — one shared "until X" reads cleanest. After a long gap (machine asleep) they can
  // genuinely diverge; then each tool gets its own time.
  const resetTimes = resets
    .map((reset) => reset.resetsAt)
    .filter((resetsAt): resetsAt is string => resetsAt !== undefined)
    .map((resetsAt) => Date.parse(resetsAt));
  const sharedReset = resetTimes.length === resets.length
    && Math.max(...resetTimes) - Math.min(...resetTimes) <= 60 * 60_000;
  const usageLabel = (reset: (typeof resets)[number]) => `${reset.tool.label} ${reset.usedPercent.toFixed(0)}%`;
  const detail = sharedReset
    ? `${resets.map(usageLabel).join(' · ')} · clean slates until ${resetLabel(resets[0]!.resetsAt!)}`
    : resets
      .map((reset) => {
        const untilSuffix = reset.resetsAt ? ` until ${resetLabel(reset.resetsAt)}` : '';
        return `${usageLabel(reset)}${untilSuffix}`;
      })
      .join(' · ');
  return [{
    id: `ai-usage:reset:${resets.map((reset) => reset.tool.id).sort((a, b) => a.localeCompare(b)).join('+')}`,
    source: 'ai-usage', kind: 'ai-usage', score: 66, shapes: ['secondary', 'tile'],
    kicker: 'Fresh allowance', title: `${resets.map((reset) => reset.tool.label).join(' & ')} usage just reset`,
    detail,
    href: '#/ai', render: aiUsageRender(resets.map((reset) => aiAccent(reset.tool)), 'weekly'),
  }];
}

/**
 * One average `fiveHourUsedPercent` per calendar day (UTC), oldest first. History points are
 * sampled every ~15 minutes (see `usageHistory.ts`), so slicing the raw array by `baselineWindowDays`
 * would take the last few hours, not the last few days — bucketing first keeps the unit the caller
 * actually asked for, matching how `githubCandidates` compares against trailing daily counts.
 */
function dailyFiveHourAverages(history: UsageHistoryPoint[]): number[] {
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const point of history) {
    if (point.fiveHourUsedPercent === undefined) continue;
    const day = point.at.slice(0, 10);
    const bucket = byDay.get(day) ?? { sum: 0, count: 0 };
    bucket.sum += point.fiveHourUsedPercent;
    bucket.count += 1;
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, { sum, count }]) => sum / count);
}

function aiToolCandidates(
  tool: AiTool,
  baselineWindowDays: number,
  baselineDeviationPercent: number,
): Candidate[] {
  const data = tool.data!;
  const candidates: Candidate[] = [];

  // fiveHour, not weekly: a cumulative weekly % naturally climbs through the week regardless of
  // pace, so comparing it against trailing samples would flag every Friday as "anomalous."
  const currentFiveHour = data.fiveHour?.usedPercent;
  if (currentFiveHour === undefined) return candidates;
  // Excludes today's (partial, still-forming) bucket, mirroring githubCandidates' own trailing window.
  const priorFiveHour = dailyFiveHourAverages(data.history).slice(-(baselineWindowDays + 1), -1);
  const deviation = computeDeviation(currentFiveHour, priorFiveHour, baselineDeviationPercent);
  if (deviation?.anomalous && deviation.direction === 'above') {
    candidates.push({
      id: `ai-usage:anomaly:${tool.id}`, source: 'ai-usage', kind: 'ai-usage', score: 75, shapes: [...allShapes],
      kicker: 'Heavy usage', title: `${tool.label} running well above usual`,
      detail: `${deviation.deviationPercent.toFixed(0)}% above your usual pace`, href: '#/ai', accent: aiAccent(tool), render: aiUsageRender([aiAccent(tool)], 'fiveHour'),
    });
  }
  return candidates;
}

export function aiCandidates(
  tools: AiTool[],
  baselineWindowDays: number,
  baselineDeviationPercent: number,
): Candidate[] {
  const available = tools.filter((tool) => tool.data?.available);
  const runway = aiRunwayCandidate(available);

  return [
    ...(runway ? [runway] : []),
    ...aiResetCandidates(available),
    ...fiveHourResetCandidates(available),
    ...available.flatMap((tool) => aiToolCandidates(tool, baselineWindowDays, baselineDeviationPercent)),
  ];
}
