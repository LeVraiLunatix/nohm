import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useId, useRef } from 'react';
import type { MotionValue } from 'motion/react';
import type { HealthData } from '@nohm/shared';

interface ActivityRingsProps {
  activeEnergyKcal: number;
  exerciseMinutes: number;
  standHours: number;
  goals: HealthData['goals'];
}

interface CompactActivityRingsProps extends ActivityRingsProps {
  /** Rendered size in CSS pixels; defaults to the command-center tile size. */
  size?: number;
}

function ringLaps(value: number, goal: number) {
  if (!Number.isFinite(value) || !Number.isFinite(goal) || goal <= 0) return [0];

  const progress = Math.max(value / goal, 0);
  const completedLaps = Math.floor(progress);
  const remainder = progress % 1;

  // Each completed lap is a separate stroke. Rendering them in order lets the
  // final partial lap's rounded, shadowed tip sit over the completed ring.
  return [
    ...Array.from({ length: completedLaps }, () => 1),
    ...(remainder > 0 || completedLaps === 0 ? [remainder] : []),
  ];
}

const LAP_DURATION = 1.4;

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

// One motion value drives an entire ring's animation, from 0 up to its raw
// (possibly >1) progress — overflow laps are just clamped slices of this same
// continuous number (see RingPaint), and the tip dot's angle is its
// fractional part (see OverflowTipShadow/Cap). Nothing restarts or hands off
// between laps: it's one uninterrupted tween, so multi-lap overflow reads as
// a single sweep doing extra revolutions rather than a chain of animations
// that visibly stop and hand off at each 100% mark.
function useRingReveal(totalProgress: number, delay: number, duration: number, inView: boolean) {
  const prefersReducedMotion = useReducedMotion();
  const reveal = useMotionValue(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      reveal.set(totalProgress);
      return;
    }
    if (!inView) {
      reveal.set(0);
      return;
    }
    const controls = animate(reveal, totalProgress, { duration, delay, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [reveal, totalProgress, delay, duration, inView, prefersReducedMotion]);

  return reveal;
}

function RingPaint({
  maskId,
  radius,
  strokeWidth,
  reveal,
  phase,
  start,
  end,
  seamUnderTip,
  lapIndex,
}: Readonly<{
  maskId: string;
  radius: number;
  strokeWidth: number;
  reveal: MotionValue<number>;
  phase: number;
  start: string;
  end: string;
  seamUnderTip: boolean;
  lapIndex: number;
}>) {
  const circumference = 2 * Math.PI * radius;
  // `reveal` is the whole ring's raw progress (0 up to totalProgress); this
  // lap only cares about its own clamped 0-1 slice of it.
  const strokeDashoffset = useTransform(reveal, (r) => circumference * (1 - clamp01(r - lapIndex)));
  // The butt cap below flattens BOTH ends of the arc — the growing tip (where
  // we want that, to avoid doubling up with OverflowTipCap) and the fixed
  // start point at angle 0 (where we don't: nothing else rounds it off, so it
  // reads as a flat edge right at the beginning of the sweep). Round just the
  // start with a small stationary circle, gated so it only appears once this
  // lap has actually started revealing — otherwise it'd show as a stray dot
  // sitting at 0%.
  const startCapOpacity = useTransform(reveal, (r) => (clamp01(r - lapIndex) > 0 ? 1 : 0));
  const capAngle = seamUnderTip ? 0 : Math.asin(Math.min(strokeWidth / 2 / radius, 1)) * (180 / Math.PI);
  // Overflow rings lock the gradient's rotation to the LIVE sweep position
  // (reveal's fractional part — the same value driving the tip's angle),
  // not the final target phase. The gradient has one hard dark/light seam;
  // it must always sit under the moving tip. With a rotation fixed to the
  // final phase, a completed lap's mask sweeps a full 0→360 revolution,
  // inevitably crossing that fixed seam angle before the tip catches up to
  // it — "printing" the seam onto the ring, uncovered, until the next lap's
  // tip sweeps back around to it. Keeping every lap's rotation tied to the
  // current tip instead means the seam moves with the tip and is never
  // exposed, at any point during the animation, not just at rest.
  const gradient = useTransform(reveal, (r) => {
    const livePhase = seamUnderTip ? r % 1 : phase;
    const phaseAngle = livePhase * 360 + capAngle + 90;
    return `conic-gradient(from ${phaseAngle}deg at 50% 50%, ${start} 0deg, ${start} 7deg, ${end} 345deg, ${end} 360deg)`;
  });

  return (
    <>
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth={strokeWidth}
          // Overflow rings show their tip via the separate OverflowTipCap marker,
          // not the stroke's own end — a round cap here would poke out as a
          // stray bump right at the 0%/100% seam on a fully-closed lap.
          strokeLinecap={seamUnderTip ? 'butt' : 'round'}
          strokeDasharray={circumference}
          style={{ strokeDashoffset }}
        />
        {seamUnderTip && (
          <motion.circle cx={60 + radius} cy="60" r={strokeWidth / 2} fill="white" style={{ opacity: startCapOpacity }} />
        )}
      </mask>
      <foreignObject x="0" y="0" width="120" height="120" mask={`url(#${maskId})`}>
        <motion.div style={{ width: 120, height: 120, background: gradient }} />
      </foreignObject>
    </>
  );
}

// Apple-style ring tips cast their shadow a small distance *ahead* along the
// arc. Deriving it from the next point keeps the scale right for every ring
// radius; a small clockwise bias matches the native-looking angle.
function overflowShadowFilter(tipAngle: number, radius: number, shadowColor: string) {
  const shadowAngle = tipAngle + Math.PI * 2 * 0.016;
  const shadowDistance = radius * Math.hypot(
    Math.cos(shadowAngle) - Math.cos(tipAngle),
    Math.sin(shadowAngle) - Math.sin(tipAngle),
  );
  const shadowDirection = Math.atan2(
    Math.sin(shadowAngle) - Math.sin(tipAngle),
    Math.cos(shadowAngle) - Math.cos(tipAngle),
  ) + (Math.PI / 36);
  const shadowX = shadowDistance * Math.cos(shadowDirection);
  const shadowY = shadowDistance * Math.sin(shadowDirection);
  const shadowTint = `light-dark(color-mix(in srgb, ${shadowColor} 48%, transparent), color-mix(in srgb, ${shadowColor} 76%, transparent))`;
  // The offset above has to clear the blur radius by enough margin that the
  // Gaussian falloff doesn't wrap back over the tip's trailing (non-edge)
  // side — too small a gap and the "shadow" shows up faintly on both sides
  // instead of only the leading one.
  return `drop-shadow(${shadowX}px ${shadowY}px 0.8px ${shadowTint})`;
}

// The tip dot is a single element for the whole ring (not one per lap): its
// angle is the fractional part of the shared reveal value, so it orbits
// continuously — sweeping past 100%, wrapping, and continuing into the next
// lap — instead of a separate dot per lap sitting idle until its own turn.
function useTipAngle(reveal: MotionValue<number>) {
  return useTransform(reveal, (r) => (r % 1) * Math.PI * 2);
}

function OverflowTipShadow({
  radius,
  reveal,
  strokeWidth,
  shadowColor,
}: Readonly<{
  radius: number;
  reveal: MotionValue<number>;
  strokeWidth: number;
  shadowColor: string;
}>) {
  const angle = useTipAngle(reveal);
  const cx = useTransform(angle, (a) => 60 + radius * Math.cos(a));
  const cy = useTransform(angle, (a) => 60 + radius * Math.sin(a));
  const filter = useTransform(angle, (a) => overflowShadowFilter(a, radius, shadowColor));

  return <motion.circle r={strokeWidth / 2} fill={shadowColor} style={{ cx, cy, filter }} />;
}

function OverflowTipCap({
  radius,
  reveal,
  strokeWidth,
  color,
}: Readonly<{
  radius: number;
  reveal: MotionValue<number>;
  strokeWidth: number;
  color: string;
}>) {
  const angle = useTipAngle(reveal);
  const cx = useTransform(angle, (a) => 60 + radius * Math.cos(a));
  const cy = useTransform(angle, (a) => 60 + radius * Math.sin(a));

  return <motion.circle r={strokeWidth / 2} fill={color} style={{ cx, cy }} />;
}

// One ring (move/exercise/stand): owns the single reveal value shared by all
// of its laps and its overflow tip (see useRingReveal).
function RingGroup({
  ring,
  strokeWidth,
  baseDelay,
  maskIdPrefix,
  inView,
  outline,
}: Readonly<{
  ring: { id: string; start: string; end: string; track: string; radius: number; value: number; goal: number };
  strokeWidth: number;
  baseDelay: number;
  maskIdPrefix: string;
  inView: boolean;
  outline?: boolean;
}>) {
  const laps = ringLaps(ring.value, ring.goal);
  const hasOverflow = laps.length > 1;
  const totalProgress = Number.isFinite(ring.value) && Number.isFinite(ring.goal) && ring.goal > 0
    ? Math.max(ring.value / ring.goal, 0)
    : 0;
  const duration = hasOverflow ? LAP_DURATION * totalProgress : LAP_DURATION;
  const reveal = useRingReveal(totalProgress, baseDelay, duration, inView);
  // One shared rotation for every lap in this ring — see the comment in
  // RingPaint for why a per-lap phase doesn't work once laps overlap.
  const phase = totalProgress % 1;

  return (
    <g transform="rotate(-90 60 60)">
      {outline && <circle cx="60" cy="60" r={ring.radius} fill="none" strokeWidth={strokeWidth + 2} style={{ stroke: 'light-dark(transparent, #090c10)' }} />}
      <circle cx="60" cy="60" r={ring.radius} fill="none" strokeWidth={strokeWidth} style={{ stroke: ring.track }} />
      {/* index-as-key is safe here: ringLaps only grows/shrinks at the array's
          tail, so a lap's index is also its stable lap number. */}
      {laps.map((_progress, lapIndex) => (
        <RingPaint
          key={lapIndex} // NOSONAR: typescript:S6479 — index is the lap's real identity, see comment above
          maskId={`${maskIdPrefix}-lap-${lapIndex}-mask`}
          radius={ring.radius}
          strokeWidth={strokeWidth}
          reveal={reveal}
          phase={phase}
          start={ring.start}
          end={ring.end}
          seamUnderTip={hasOverflow}
          lapIndex={lapIndex}
        />
      ))}
      {hasOverflow && (
        <>
          <OverflowTipShadow radius={ring.radius} reveal={reveal} strokeWidth={strokeWidth} shadowColor={ring.start} />
          <OverflowTipCap radius={ring.radius} reveal={reveal} strokeWidth={strokeWidth} color={ring.end} />
        </>
      )}
    </g>
  );
}

export function ActivityRings({
  activeEnergyKcal,
  exerciseMinutes,
  standHours,
  goals,
}: Readonly<ActivityRingsProps>) {
  const gradientPrefix = useId().replaceAll(':', '');
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { once: true, amount: 0.5 });
  const rings = [
    { id: 'move', label: 'Move', value: activeEnergyKcal, goal: goals.activeEnergyKcal, unit: 'kcal', start: '#d91f3b', end: '#ff5a8b', legend: 'light-dark(#ec4899, #ff5a8b)', track: 'light-dark(#f6c7d2, #4c0717)', radius: 48 },
    { id: 'exercise', label: 'Exercise', value: exerciseMinutes, goal: goals.exerciseMinutes, unit: 'min', start: '#70cc00', end: '#d4ff00', legend: 'light-dark(#84cc16, #d4ff00)', track: 'light-dark(#d8efc4, #173c0a)', radius: 33 },
    { id: 'stand', label: 'Stand', value: standHours, goal: goals.standHours, unit: 'hrs', start: '#00b7cb', end: '#48def4', legend: 'light-dark(#06b6d4, #48def4)', track: 'light-dark(#c3e9ee, #063940)', radius: 18 },
  ];

  return (
    <div className="rounded-2xl bg-track/25 p-3">
      <div className="flex items-center gap-4">
        <svg ref={svgRef} viewBox="0 0 120 120" className="h-32 w-32 shrink-0" aria-label="Daily activity rings" role="img">
          {rings.map((ring, index) => (
            <RingGroup
              key={ring.id}
              ring={ring}
              strokeWidth={12}
              baseDelay={index * 0.18}
              maskIdPrefix={`${gradientPrefix}-${ring.id}`}
              inView={inView}
              outline
            />
          ))}
        </svg>
        <div className="min-w-0 flex-1 space-y-2">
          {rings.map((ring) => (
            <div key={ring.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium" style={{ color: ring.legend }}>{ring.label}</span>
              <span className="tabular-nums text-ink-faint">
                <span className="font-semibold text-ink">{Math.round(ring.value).toLocaleString()}</span> / {ring.goal.toLocaleString()} {ring.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A legend-free, tile-sized version of ActivityRings for compact slots (command-center tiles). */
export function CompactActivityRings({
  activeEnergyKcal,
  exerciseMinutes,
  standHours,
  goals,
  size = 40,
}: Readonly<CompactActivityRingsProps>) {
  const gradientPrefix = useId().replaceAll(':', '');
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { once: true, amount: 0.5 });
  const rings = [
    { id: 'move', value: activeEnergyKcal, goal: goals.activeEnergyKcal, start: '#d91f3b', end: '#ff5a8b', track: 'light-dark(#f6c7d2, #4c0717)', radius: 48 },
    { id: 'exercise', value: exerciseMinutes, goal: goals.exerciseMinutes, start: '#70cc00', end: '#d4ff00', track: 'light-dark(#d8efc4, #173c0a)', radius: 33 },
    { id: 'stand', value: standHours, goal: goals.standHours, start: '#00b7cb', end: '#48def4', track: 'light-dark(#c3e9ee, #063940)', radius: 18 },
  ];

  return (
    <svg ref={svgRef} viewBox="0 0 120 120" style={{ width: size, height: size }} className="shrink-0" aria-label="Daily activity rings" role="img">
      {rings.map((ring, index) => (
        <RingGroup
          key={ring.id}
          ring={ring}
          strokeWidth={14}
          baseDelay={index * 0.18}
          maskIdPrefix={`${gradientPrefix}-compact-${ring.id}`}
          inView={inView}
        />
      ))}
    </svg>
  );
}
