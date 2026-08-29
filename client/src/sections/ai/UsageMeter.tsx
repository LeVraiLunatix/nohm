import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import type { AiUsageToolData } from '@nohm/shared';
import { AnimatedNumber } from '../../components/AnimatedNumber';
import { formatCompactNumber } from '../../lib/format';

export const FIVE_HOUR_MS = 5 * 60 * 60_000;
export const WEEKLY_MS = 7 * 24 * 60 * 60_000;

export type RateLimit = NonNullable<AiUsageToolData['fiveHour']>;

function resetLabel(resetsAt: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(resetsAt));
}

/** Fraction of the rolling window elapsed, assuming resetsAt = window start + durationMs. */
export function paceElapsedPercent(resetsAt: string, durationMs: number) {
  const remainingMs = new Date(resetsAt).getTime() - Date.now();
  const elapsedMs = durationMs - remainingMs;
  return Math.max(0, Math.min(100, (elapsedMs / durationMs) * 100));
}

function paceLabel(percent: number, pace: number) {
  return `${Math.round(percent)}% used · ${Math.round(pace)}% elapsed`;
}

/** Floats above (or, near the top of the viewport, below) the marker. Rendered via a portal to
 * `document.body` rather than as a normal absolutely-positioned child: the bars live inside cards
 * with `overflow-hidden` (see SectionCard), which would silently clip a tooltip positioned inside
 * that tree. Position comes from a live `getBoundingClientRect()` on the marker, so it tracks the
 * marker's actual screen position regardless of layout. */
function PaceTooltip({ anchorRect, percent, pace }: Readonly<{ anchorRect: DOMRect; percent: number; pace: number }>) {
  const gap = 8;
  // Not enough room to sit above without clipping against the top of the viewport — flip below.
  const placeBelow = anchorRect.top < 72;
  const top = placeBelow ? anchorRect.bottom + gap : anchorRect.top - gap;
  const left = Math.min(Math.max(anchorRect.left + anchorRect.width / 2, 90), window.innerWidth - 90);

  return createPortal(
    <div
      role="tooltip"
      className="glass pointer-events-none fixed z-50 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] leading-tight"
      style={{ left, top, transform: `translate(-50%, ${placeBelow ? '0' : '-100%'})` }}
    >
      <p className="font-semibold tabular-nums text-ink">{paceLabel(percent, pace)}</p>
    </div>,
    document.body,
  );
}

/** Marks how far through the window we'd be at a perfectly linear usage rate, so where the fill
 * ends relative to this line shows pace at a glance. One fixed appearance regardless of ahead/behind
 * — status is conveyed by the hover tooltip instead of by color — with a canvas-colored halo so it
 * stays visible against both the colored fill and the bare track, and drawn taller than the bar so
 * it reads as a tick mark rather than blending into the bar's edge. The hit target is widened past
 * the visible 3px line so it's actually hoverable/tappable. */
function PaceMarker({ pace, percent }: Readonly<{ pace: number; percent: number }>) {
  const ref = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const show = () => setAnchorRect(ref.current?.getBoundingClientRect() ?? null);
  const hide = () => setAnchorRect(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={paceLabel(percent, pace)}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className="absolute -top-[3px] h-[calc(100%+6px)] w-[9px] -translate-x-1/2 cursor-help appearance-none border-0 bg-transparent p-0"
        style={{ left: `${pace}%` }}
      >
        <span
          className="mx-auto block h-full w-[3px] rounded-full"
          style={{ backgroundColor: 'var(--color-ink)', opacity: 0.85, boxShadow: '0 0 0 1.5px var(--color-canvas)' }}
        />
      </button>
      {anchorRect && <PaceTooltip anchorRect={anchorRect} percent={percent} pace={pace} />}
    </>
  );
}

/** Fill bar shared by the full meter and the overview lane. The pace marker is a sibling of the
 * clipped fill track (not inside it) so it can extend past the bar's height without being cut off
 * by the track's rounded-corner clipping. */
function UsageBar({
  percent,
  color,
  pace,
}: Readonly<{
  percent: number;
  color: string;
  pace?: number;
}>) {
  return (
    <div className="relative h-1.5">
      <div className="absolute inset-0 overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          style={{ backgroundColor: color }}
        />
      </div>
      {pace !== undefined && <PaceMarker pace={pace} percent={percent} />}
    </div>
  );
}

export function UsageMeter({
  label,
  limit,
  color,
  windowMs,
  tokens,
}: Readonly<{
  label: string;
  limit: RateLimit;
  color: string;
  windowMs: number;
  tokens?: number;
}>) {
  const pace = paceElapsedPercent(limit.resetsAt, windowMs);

  return (
    <div>
      <div className="mb-1 flex items-baseline text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="ml-auto font-semibold tabular-nums">
          <AnimatedNumber value={limit.usedPercent} suffix="%" />
        </span>
      </div>
      <UsageBar percent={limit.usedPercent} color={color} pace={pace} />
      <p className="mt-1 text-[11px] text-ink-faint">
        Resets {resetLabel(limit.resetsAt)}
        {tokens !== undefined && ` · ${formatCompactNumber(tokens)} tokens`}
      </p>
    </div>
  );
}

/** One overview-card row: a label/value line with that window's own bar directly beneath it.
 * `resetsAt`/`windowMs` are optional together — pass both to show a pace marker, omit both for a
 * plain fill (e.g. a lane with no rate-limit window to pace against). */
export function UsageLane({
  label,
  value,
  percent,
  color,
  resetsAt,
  windowMs,
}: Readonly<{
  label: string;
  value: string;
  percent?: number;
  color: string;
  resetsAt?: string;
  windowMs?: number;
}>) {
  const pace = resetsAt && windowMs ? paceElapsedPercent(resetsAt, windowMs) : undefined;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-ink-muted">
        <span>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      {percent !== undefined && <UsageBar percent={percent} color={color} pace={pace} />}
    </div>
  );
}

/** Claude omits the 5-hour quota entirely when no session is active. Treat a confirmed zero
 * local total as an empty window, rather than making token count look like the quota state. */
export function ZeroUsageMeter({
  label,
  color,
}: Readonly<{
  label: string;
  color: string;
}>) {
  return (
    <div>
      <div className="mb-1 flex items-baseline text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="ml-auto font-semibold tabular-nums">0%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-track">
        <motion.div className="h-full rounded-full" initial={{ width: 0 }} animate={{ width: '0%' }} style={{ backgroundColor: color }} />
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">No active window</p>
    </div>
  );
}
