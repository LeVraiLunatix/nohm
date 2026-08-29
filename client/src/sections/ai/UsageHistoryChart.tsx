import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { UsageHistoryPoint } from '@nohm/shared';

const W = 100;
const H = 32;
/** Mirrors the server's command-center reset threshold for provider reports above zero. */
const RESET_DROP_PERCENT = 40;
/** Fixed floor added on top of groupResetReadings' poll-gap-scaled tolerance, so back-to-back
 * polls with a near-zero gap still absorb the provider's minute-level rounding on the deadline
 * text (e.g. "5:19pm" vs "5:20pm" for the same still-open window). */
const RESET_DRIFT_MS = 5 * 60_000;

type Metric = 'fiveHourUsedPercent' | 'weeklyUsedPercent' | 'modelWeeklyUsedPercent';

/** Which history-point field carries a given metric's own reported reset deadline — there's no
 * per-point deadline for modelWeekly, so that metric never gets the session-reset treatment. */
const RESET_FIELD: Partial<Record<Metric, 'fiveHourResetsAt' | 'weeklyResetsAt'>> = {
  fiveHourUsedPercent: 'fiveHourResetsAt',
  weeklyUsedPercent: 'weeklyResetsAt',
};

interface ChartPoint {
  x: number;
  y: number;
  at: string;
  percent: number;
  /** Sort same-timestamp synthetic reset points in their visual event order. */
  order?: number;
  /** Synthetic 100% endpoint immediately before a known allowance reset. */
  sessionCapEnd?: boolean;
  /** Synthetic zero at a reset deadline observed in a historical sample. */
  resetAnchor?: boolean;
  /** Synthetic zero at the start of a newly-reset rolling allowance. */
  sessionStart?: boolean;
  /** The zero is an observed reset, rather than a predicted reset deadline. */
  observedReset?: boolean;
}

const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Beyond a week, a weekday name alone repeats (multiple Mondays), so the date carries the
 * disambiguating info instead. */
function timeLabel(iso: string, windowMs: number): string {
  let dateOptions: Intl.DateTimeFormatOptions = {};
  if (windowMs > WEEK_MS) {
    dateOptions = { month: 'short', day: 'numeric' };
  } else if (windowMs > 24 * 60 * 60_000) {
    dateOptions = { weekday: 'short' };
  }

  return new Intl.DateTimeFormat(undefined, {
    ...dateOptions,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface ChartGeometry {
  points: ChartPoint[];
  /** Line through runs of normally-spaced samples (may hold several M subpaths). */
  solidPath: string;
  /** Fill under established measured runs only, so reset markers and short joins stay legible. */
  areaPaths: string[];
  /** Dashed joins across sampling gaps (server asleep / dashboard off). */
  gapPath: string;
  /** Samples with a gap on both sides — invisible without their own mark. */
  dots: ChartPoint[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Same approach as the health trend charts: samples arrive on a steady cadence while the server
 * is up, so a spacing well beyond the typical interval means missing data — join it with a
 * dashed segment instead of implying a solid recorded line. The threshold adapts to the data
 * (3× the median spacing) since the client doesn't know the server's sampling config.
 */
function buildGeometry(chartPoints: ChartPoint[]): ChartGeometry {
  const times = chartPoints.map((point) => Date.parse(point.at));
  const deltas = times.slice(1).map((time, i) => time - times[i]);
  const gapMs = median(deltas) * 3;

  const runs: ChartPoint[][] = [[chartPoints[0]]];
  const gapJoins: Array<{ from: ChartPoint; to: ChartPoint }> = [];
  deltas.forEach((delta, i) => {
    const next = chartPoints[i + 1];
    // Usage can't be sampled between the last real reading and the reset deadline, but a rate
    // limit holds the value flat until it lapses. Draw that hold dashed (it's an assumption, not
    // a sample) rather than interpolating a diagonal descent; the reset itself still lands as a
    // solid vertical drop below, and the next observed session rises normally from zero.
    if (next.sessionCapEnd) {
      gapJoins.push({ from: runs.at(-1)!.at(-1)!, to: next });
      runs.push([next]);
      return;
    }
    if (next.resetAnchor) {
      if (runs.at(-1)!.at(-1)!.sessionCapEnd) {
        runs.at(-1)!.push(next);
        return;
      }
      gapJoins.push({ from: runs.at(-1)!.at(-1)!, to: next });
      runs.push([next]);
      return;
    }
    // A rolling allowance reset is an explicitly known endpoint, but the path leading to it was
    // not sampled. Draw that descent dashed rather than leaving a misleading blank space or a
    // solid interpolation; the next run rises normally from the known 0% session start.
    if (next.sessionStart) {
      if (runs.at(-1)!.at(-1)!.resetAnchor) {
        runs.at(-1)!.push(next);
        return;
      }
      gapJoins.push({ from: runs.at(-1)!.at(-1)!, to: next });
      runs.push([next]);
      return;
    }
    // The first observed point after a reset belongs to the zero anchor even if the dashboard
    // did not sample immediately. That slope represents known within-session accumulation.
    if (delta > gapMs && !runs.at(-1)![0].sessionStart) {
      gapJoins.push({ from: runs.at(-1)!.at(-1)!, to: next });
      runs.push([]);
    }
    runs.at(-1)!.push(chartPoints[i + 1]);
  });

  const solidRuns = runs.filter((run) => run.length > 1);
  const runLine = (run: ChartPoint[]) =>
    run.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  // A two-point run is often just the crisp vertical edge of a reset, or the first pair after
  // the dashboard comes back online. Filling it turns a useful boundary into a heavy rectangle;
  // reserve the quiet area wash for a sustained sequence of real samples instead.
  const areaRuns = solidRuns.filter((run) => (
    run.length >= 3
    && run.every((point) => !point.sessionCapEnd && !point.resetAnchor && !point.sessionStart && !point.observedReset)
  ));
  return {
    points: chartPoints,
    solidPath: solidRuns.map(runLine).join(' '),
    areaPaths: areaRuns.map((run) => `${runLine(run)} L${run.at(-1)!.x},${H} L${run[0].x},${H} Z`),
    gapPath: gapJoins
      .map(({ from, to }) => `M${from.x},${from.y} L${to.x},${to.y}`)
      .join(' '),
    dots: runs.filter((run) => run.length === 1).map((run) => run[0]),
  };
}

/**
 * A provider-reported zero after positive use, or a large downward jump, is concrete reset
 * evidence. Add the preceding value at the new sample's timestamp so the line stays level until
 * that observation, then falls vertically instead of misleadingly interpolating a gradual decline.
 *
 * This is a fallback heuristic for metrics (or gaps) with no precisely known reset deadline. When
 * `knownResets` already places one between these two samples, addSessionResetPoints draws that
 * transition exactly via the reset anchor — inserting a second, guessed duplicate here would draw
 * a redundant rise-then-drop spike at the next poll's timestamp, one the hover tie-break always
 * loses to the real reading beside it, so it renders but is never selectable.
 */
function addObservedResetPoints(chartPoints: ChartPoint[], knownResets: number[]): void {
  // Bounded to the pre-existing length: the loop pushes synthetic points onto chartPoints as it
  // goes, and `chartPoints.length` is re-read every iteration, so an unbounded loop would
  // eventually treat an earlier reset's synthetic point as a fresh neighbor of a later, unrelated
  // one — comparing their values as if adjacent in time and fabricating a bogus extra reset.
  const observedLength = chartPoints.length;
  for (let index = 1; index < observedLength; index += 1) {
    const previous = chartPoints[index - 1]!;
    const current = chartPoints[index]!;
    const drop = previous.percent - current.percent;
    const confirmedZero = previous.percent > 0 && current.percent === 0;
    if (!confirmedZero && drop < RESET_DROP_PERCENT) continue;
    const previousTime = Date.parse(previous.at);
    const currentTime = Date.parse(current.at);
    if (knownResets.some((reset) => reset > previousTime && reset <= currentTime)) continue;
    current.observedReset = true;
    chartPoints.push({
      ...previous,
      x: current.x,
      at: current.at,
      order: -1,
    });
  }
}

/** Groups poll-ordered reset-deadline readings into one entry per real reset. A still-open
 * window's reported deadline isn't necessarily fixed — Claude's five-hour cadence only jitters by
 * rounding, but Codex's rolling weekly window drifts forward roughly in step with real elapsed
 * time between polls (ongoing usage keeps pushing the deadline out), so a whole day of ~15-minute
 * polls can each report a "new" deadline tens of minutes later than the last, all still describing
 * the same not-yet-triggered reset. Sorting by value first (as a plain proximity cluster would)
 * loses which reading came from which poll, so a slow multi-hour drift reads as dozens of distinct
 * close-together resets instead of one.
 *
 * Reading order here is poll time, not reset value: treat consecutive readings as the same event
 * as long as the deadline didn't move much faster than real time passed — observed drift ran up to
 * ~1.9x the poll gap on real data (usage during the interval pushes the deadline out further than
 * the interval itself), so 3x leaves headroom while staying far below a genuine next-session jump
 * (hours for the five-hour metric, days for weekly). Capped at half the session window as a hard
 * ceiling so an unusually long polling outage can never merge two genuinely distinct resets just
 * because the gap between them was large. A jump beyond that — the deadline lurching far ahead, or
 * snapping back after the window actually elapsed — means this reading belongs to a new reset.
 * Keeps the most recently reported deadline for each event, since that's the freshest estimate. */
function groupResetReadings(readings: Array<{ at: number; reset: number }>, sessionWindowMs: number): number[] {
  const resets: number[] = [];
  let current: { at: number; reset: number } | undefined;
  for (const reading of readings) {
    const tolerance = current
      ? Math.min((reading.at - current.at) * 3 + RESET_DRIFT_MS, sessionWindowMs / 2)
      : 0;
    if (current && Math.abs(reading.reset - current.reset) <= tolerance) {
      current = reading;
    } else {
      if (current) resets.push(current.reset);
      current = reading;
    }
  }
  if (current) resets.push(current.reset);
  return resets;
}

/** Pushes the cap-end/reset-anchor pair for one reset timestamp, if it falls in the visible window.
 * `stablePoints` is a pre-loop snapshot so one reset's insertions can't leak into another's lookup. */
function addResetAnchor(
  chartPoints: ChartPoint[],
  stablePoints: ChartPoint[],
  reset: number,
  start: number,
  end: number,
  windowMs: number,
): void {
  if (reset <= start || reset > end) return;
  const observedZero = stablePoints.some((point) => Date.parse(point.at) === reset && point.percent === 0);
  // Not findLast: stablePoints isn't time-sorted (addObservedResetPoints appends its synthetic
  // duplicates at the array's tail, out of chronological order relative to their own `at`), so
  // walking by array position can return a duplicate from an unrelated, older event instead of
  // the true most-recent real sample before this reset. Find it by timestamp explicitly.
  const prior = stablePoints.reduce<ChartPoint | undefined>((closest, point) => {
    const t = Date.parse(point.at);
    if (t >= reset) return closest;
    if (!closest || t > Date.parse(closest.at)) return point;
    return closest;
  }, undefined);
  // Usage can't be sampled between the last real reading and the reset, but a rate limit holds
  // the value flat until it lapses — anchor the plateau at whatever was last reported (not just
  // an exact 100% cap), so e.g. a last reading of 99% holds level instead of interpolating a
  // diagonal descent toward the reset's zero.
  if (prior && prior.percent > 0) {
    chartPoints.push({
      x: ((reset - start) / windowMs) * W,
      y: H - (prior.percent / 100) * H,
      at: new Date(reset).toISOString(),
      percent: prior.percent,
      order: 1,
      sessionCapEnd: true,
    });
  }
  if (!observedZero) {
    chartPoints.push({
      x: ((reset - start) / windowMs) * W,
      y: H,
      at: new Date(reset).toISOString(),
      percent: 0,
      order: 2,
      resetAnchor: true,
    });
  }
}

/** Resolves the known reset deadlines for one metric, grouping poll-ordered reports of the same
 * still-ongoing window into a single event (see groupResetReadings). Empty for a metric with no
 * resetField (modelWeekly) — those fall back entirely to addObservedResetPoints' heuristic. */
function computeKnownResets(
  points: UsageHistoryPoint[],
  resetField: 'fiveHourResetsAt' | 'weeklyResetsAt' | undefined,
  sessionResetsAt: string | undefined,
  sessionWindowMs: number | undefined,
  now: number,
): number[] {
  if (!resetField || !sessionWindowMs) return [];
  const readings = points
    .map((point) => ({ at: Date.parse(point.at), reset: Date.parse(point[resetField] ?? '') }))
    .filter((reading) => Number.isFinite(reading.at) && Number.isFinite(reading.reset))
    // A rolling window's own deadline can never be more than one window past when it was polled
    // (it was already partway through the window) — a reading claiming otherwise is corrupt
    // (observed: a bad Claude CLI snapshot reporting a five-hour reset 24h out) and would
    // otherwise get accepted as a lone, unmergeable "reset", anchoring a fake plateau on the chart.
    .filter((reading) => reading.reset - reading.at <= sessionWindowMs + RESET_DRIFT_MS);
  if (sessionResetsAt) {
    const reset = Date.parse(sessionResetsAt);
    if (Number.isFinite(reset)) readings.push({ at: now, reset });
  }
  readings.sort((a, b) => a.at - b.at);
  return groupResetReadings(readings, sessionWindowMs);
}

/** Splices the synthetic reset/session-start markers (see ChartPoint) into chartPoints in place,
 * one set per known reset timestamp within the visible window.
 *
 * `includeSessionStart` gates only the "fresh session began at 0%" marker, not the reset-anchor
 * itself. That marker is derived by subtracting a full window from a reset deadline — a reliable
 * guess for the five-hour quota, which genuinely resets on close to a fixed cadence, but not for
 * the weekly quota: real usage doesn't align to a 7-day grid, so the same subtraction can land
 * over an hour off the actual reset, drawing a false plateau/decline across a real one. The
 * reset-anchor itself doesn't have this problem — it uses each sample's own reported deadline
 * directly, no backdating involved — so it's precise for both metrics. */
function addSessionResetPoints(
  chartPoints: ChartPoint[],
  resets: number[],
  sessionWindowMs: number,
  includeSessionStart: boolean,
  start: number,
  end: number,
  windowMs: number,
): void {
  // Snapshot before mutating: without this, an earlier reset's synthetic insertions (pushed onto
  // chartPoints below) could be picked up as a *later* reset's "prior" sample, since they're
  // appended out of chronological order.
  const stablePoints = [...chartPoints];
  for (const reset of resets) {
    addResetAnchor(chartPoints, stablePoints, reset, start, end, windowMs);
    if (!includeSessionStart) continue;
    const sessionStart = reset - sessionWindowMs;
    if (sessionStart <= start || sessionStart > end) continue;
    // When resets run back-to-back at the normal cadence (the common case for the five-hour
    // metric), backdating a full window from this reset lands exactly on the *previous* reset,
    // which already got its own zero-anchor pair from that earlier loop iteration. Pushing a
    // second, duplicate zero here doesn't add information — it splits buildGeometry's run right
    // after the real reset, which quietly drops the gap-dash guard for whatever comes next and
    // draws a misleading solid "smooth accumulation" line across what was actually an unsampled
    // gap (e.g. no usage until well after the reset, then a jump).
    if (resets.some((other) => other !== reset && Math.abs(other - sessionStart) <= RESET_DRIFT_MS)) continue;
    chartPoints.push({
      x: ((sessionStart - start) / windowMs) * W,
      y: H,
      at: new Date(sessionStart).toISOString(),
      percent: 0,
      order: 2,
      sessionStart: true,
    });
  }
}

function useChartGeometry(
  points: UsageHistoryPoint[],
  metric: Metric,
  windowMs: number,
  sessionResetsAt?: string,
  sessionWindowMs?: number,
) {
  return useMemo(() => {
    const end = Date.now();
    const start = end - windowMs;
    const chartPoints = points
      .filter((point) => {
        const at = Date.parse(point.at);
        return point[metric] !== undefined && Number.isFinite(at) && at >= start && at <= end;
      })
      .map((point): ChartPoint => {
        const percent = point[metric]!;
        return {
          x: ((Date.parse(point.at) - start) / windowMs) * W,
          y: H - (percent / 100) * H,
          at: point.at,
          percent,
        };
      });
    chartPoints.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const resetField = RESET_FIELD[metric];
    const resets = computeKnownResets(points, resetField, sessionResetsAt, sessionWindowMs, end);
    addObservedResetPoints(chartPoints, resets);
    if (sessionWindowMs && resetField) {
      addSessionResetPoints(chartPoints, resets, sessionWindowMs, metric === 'fiveHourUsedPercent', start, end, windowMs);
    }
    chartPoints.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.order ?? 0) - (b.order ?? 0));
    return chartPoints.length < 2 ? null : buildGeometry(chartPoints);
  }, [points, metric, windowMs, sessionResetsAt, sessionWindowMs]);
}

/**
 * Single-series area trend of one usage metric over a rolling window. The y scale is the
 * fixed 0–100% allowance. Tap/hover reads out the nearest sample in the caption line.
 */
export function UsageHistoryChart({
  points,
  metric,
  windowMs,
  color,
  caption,
  sessionResetsAt,
  sessionWindowMs,
}: Readonly<{
  points: UsageHistoryPoint[];
  metric: Metric;
  windowMs: number;
  color: string;
  caption: string;
  /** Current rolling-window deadline; used to anchor a known reset at 0%. */
  sessionResetsAt?: string;
  sessionWindowMs?: number;
}>) {
  const geometry = useChartGeometry(points, metric, windowMs, sessionResetsAt, sessionWindowMs);
  const [hovered, setHovered] = useState<ChartPoint | null>(null);

  if (!geometry) {
    return <p className="text-[11px] text-ink-faint">{caption} — collecting history…</p>;
  }
  const chartPoints = geometry.points;

  let captionText = caption;
  if (hovered) {
    const resetSuffix = hovered.sessionStart || hovered.observedReset || hovered.resetAnchor ? ' · reset' : '';
    captionText = `${Math.round(hovered.percent)}% · ${timeLabel(hovered.at, windowMs)}${resetSuffix}`;
  }

  const readNearest = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * W;
    // sessionStart markers exist purely to anchor the "rise from zero" line geometry, not as a
    // hover target — they sit exactly at a reset boundary where a real sample is also nearby, and
    // being pixel-closer than that real sample would silently report 0% instead of its actual
    // value. Fall back to the full set only in the degenerate case where nothing else qualifies.
    const candidates = chartPoints.filter((point) => !point.sessionStart);
    const pool = candidates.length ? candidates : chartPoints;
    setHovered(
      // On an exact tie (e.g. the synthetic pre-reset duplicate and the flagged real sample
      // that follows it share the drop's x-coordinate), prefer the later point: chartPoints is
      // sorted with the reset-flagged sample after its synthetic predecessor, so `<=` surfaces
      // the reset instead of silently reporting the stale pre-reset value.
      pool.reduce((best, point) => (Math.abs(point.x - x) <= Math.abs(best.x - x) ? point : best)),
    );
  };

  return (
    <div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-16 w-full touch-none overflow-visible"
          aria-label={`${caption}: ${chartPoints.length} samples, currently ${Math.round(chartPoints.at(-1)!.percent)}%`}
          onPointerMove={readNearest}
          onPointerDown={readNearest}
          onPointerLeave={() => setHovered(null)}
        >
          {/* Recessive 100% / 50% / baseline hairlines */}
          {[0, H / 2, H].map((y) => (
            <line
              key={y}
              x1={0}
              y1={y}
              x2={W}
              y2={y}
              stroke="var(--color-card-border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {geometry.areaPaths.map((path) => <path key={path} d={path} fill={color} opacity={0.1} />)}
          {geometry.gapPath && (
            <motion.path
              d={geometry.gapPath}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="3 3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )}
          {geometry.solidPath && (
            <motion.path
              d={geometry.solidPath}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              // Not a pathLength draw-on: framer's end state keeps a normalized dasharray
              // (dash 1 / gap 1) on the path, which Chrome mis-scales under
              // non-scaling-stroke and leaves chunks of the line unpainted.
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )}
          {geometry.dots.map((point) => (
            <path
              key={`${point.at}-${point.order ?? 0}`}
              // A zero-length round-capped stroke renders as a circular dot even
              // though preserveAspectRatio="none" would distort a <circle>.
              d={`M${point.x},${point.y} l0.01,0`}
              stroke={color}
              strokeWidth={4}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {hovered && (
          <span
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${(hovered.x / W) * 100}%`,
              top: `${(hovered.y / H) * 100}%`,
              background: color,
              boxShadow: '0 0 0 2px var(--color-canvas)',
            }}
          />
        )}
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-ink-faint">{captionText}</p>
    </div>
  );
}

/** Tiny non-interactive trend line for overview blocks. */
export function UsageSparkline({
  points,
  metric,
  windowMs,
  color,
  sessionResetsAt,
  sessionWindowMs,
}: Readonly<{
  points: UsageHistoryPoint[];
  metric: Metric;
  windowMs: number;
  color: string;
  sessionResetsAt?: string;
  sessionWindowMs?: number;
}>) {
  const geometry = useChartGeometry(points, metric, windowMs, sessionResetsAt, sessionWindowMs);
  if (!geometry) return null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20 w-full overflow-visible" aria-hidden>
      {geometry.gapPath && (
        <path
          d={geometry.gapPath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray="3 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.5}
        />
      )}
      {geometry.solidPath && (
        <path
          d={geometry.solidPath}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.8}
        />
      )}
      {geometry.dots.map((point) => (
        <path
          key={`${point.at}-${point.order ?? 0}`}
          d={`M${point.x},${point.y} l0.01,0`}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.8}
        />
      ))}
    </svg>
  );
}
