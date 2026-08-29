import { useEffect, useId, useRef } from 'react';
import type { WeatherData } from '@nohm/shared';
import { motion } from 'motion/react';
import { moonIllumination, moonPhaseName } from '../../lib/weather';
import { useSkyNow } from '../../lib/skyTime';

/** Sun-arc geometry shared by the path and the dot that rides it. */
const CX = 110;
const CY = 104;
const R = 88;
const ARC_LENGTH = Math.PI * R;
const REVEAL_TRANSITION = { duration: 1.1, ease: [0.22, 1, 0.36, 1] as const, delay: 0.15 };
const SUN_APPEAR_TRANSITION = { delay: 0.9, type: 'spring' as const, stiffness: 260, damping: 18 };
const INSTANT = { duration: 0 };
const CORE_RADIUS = 6.5;
const GLOW_RADIUS = 36;

function arcPoint(fraction: number): { x: number; y: number } {
  const angle = Math.PI * fraction;
  return { x: CX - R * Math.cos(angle), y: CY - R * Math.sin(angle) };
}

/** The arc-fraction buffer needed for the sun to dip `depth` px below the horizon (y = CY).
 * Deriving this from a fixed depth — not a fixed time — is what keeps the dip the same size
 * in every season: a time-based buffer (e.g. "20 minutes") covers a much shallower dip on a
 * 19-hour summer day than an 8-hour winter one, which is what let the old version mount the
 * sun and glow while they were still mostly above the horizon — the visible "pop". */
function bufferFractionForDepth(depth: number): number {
  return Math.asin(Math.min(1, depth / R)) / Math.PI;
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function daylightLabel(sunrise: string, sunset: string): string {
  const minutes = Math.round((Date.parse(sunset) - Date.parse(sunrise)) / 60_000);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} m of daylight`;
}

interface SunArcProps {
  sunrise: string | null;
  sunset: string | null;
}

/**
 * The sun's day drawn as an arc: the track is the whole daylight window, the lit
 * sweep is how much of it has passed, and the dot is where the sun is right now.
 */
export function SunArc({ sunrise, sunset }: Readonly<SunArcProps>) {
  const gradientId = `${useId().replaceAll(':', '')}-sun`;
  // Follows the sky-preview slider when it's on, so the arc scrubs with the sky.
  const now = useSkyNow().getTime();

  // The reveal animation (arc draw-in, sun pop-in) should only ever play once per mount.
  // Every later render — whether from a real 30s tick or the debug slider firing every
  // 100ms — must snap straight to its target, or a scrub through the day looks laggy:
  // each new frame would kick off another full eased transition instead of tracking 1:1.
  const enteredRef = useRef(false);
  useEffect(() => {
    enteredRef.current = true;
  }, []);
  const entering = !enteredRef.current;
  const sweepTransition = entering ? REVEAL_TRANSITION : INSTANT;
  const sunAppearTransition = entering ? SUN_APPEAR_TRANSITION : INSTANT;

  if (!sunrise || !sunset) {
    return (
      <p className="text-sm text-ink-faint">
        {sunrise ? 'The sun never sets today.' : 'Polar night: the sun stays below the horizon.'}
      </p>
    );
  }

  const rise = Date.parse(sunrise);
  const set = Date.parse(sunset);
  const dayMs = set - rise;
  const fraction = Math.min(1, Math.max(0, (now - rise) / dayMs));
  const sunUp = now >= rise && now <= set;
  const rawFraction = (now - rise) / dayMs;
  // The glow isn't clipped by the horizon (see below), so unlike the core it needs to be fully
  // below it — depth > its own radius — before the whole group mounts, or it pops in still
  // half-visible. That makes the glow's buffer, not the smaller core's, the one that matters.
  const glowBuffer = bufferFractionForDepth(GLOW_RADIUS + 8);
  const sunVisible = rawFraction >= -glowBuffer && rawFraction <= 1 + glowBuffer;
  const sun = arcPoint(Math.min(1 + glowBuffer, Math.max(-glowBuffer, rawFraction)));
  // 1 at the true rise/set instant, smoothly down to 0 at the edge of the glow's buffer — the
  // core is purely geometric (the horizon clip does all the work), but the glow isn't clipped,
  // so it needs its own fade to avoid popping in fully-formed below the horizon.
  const overshoot = rawFraction < 0 ? -rawFraction : Math.max(0, rawFraction - 1);
  const glowFade = 1 - Math.min(1, overshoot / glowBuffer);

  let caption = daylightLabel(sunrise, sunset);
  if (now < rise) caption = `Sun rises ${timeLabel(sunrise)} · ${caption}`;
  else if (now > set) caption = `Sun has set · ${caption}`;

  return (
    <div className="min-w-0">
      <svg viewBox="-16 -26 252 144" className="w-full" aria-label={`Sunrise ${timeLabel(sunrise)}, sunset ${timeLabel(sunset)}`}>
        <defs>
          <linearGradient id={gradientId} x1="22" y1="104" x2="198" y2="104" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="var(--color-accent-weather)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--color-accent-weather)" />
          </linearGradient>
          {/* A true radial fade reads as a soft bloom; a blurred flat circle instead leaves a
              visible edge where the blur runs out — that was the hard "ring" around the old sun.
              Two stops only: any extra midpoint stop puts a kink in the falloff rate, which
              still reads as a faint ring even without a hard edge. */}
          <radialGradient id={`${gradientId}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-accent-weather)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-accent-weather)" stopOpacity="0" />
          </radialGradient>
          {/* Off-center highlight (same trick as the moon disc) so the core reads as a lit
              sphere instead of a flat tinted dot. */}
          <radialGradient id={`${gradientId}-core`} cx="36%" cy="30%" r="80%">
            <stop offset="0" stopColor="light-dark(#fffaf0, #fff6db)" />
            <stop offset="55%" stopColor="light-dark(#ffdb93, #ffd27a)" />
            <stop offset="100%" stopColor="var(--color-accent-weather)" />
          </radialGradient>
          {/* Anything below the horizon line is invisible — this is what lets the sun rise up
              out of / sink back below the horizon instead of popping in and out. */}
          <clipPath id={`${gradientId}-horizon`}>
            <rect x="-1000" y="-1000" width="2000" height={1000 + CY} />
          </clipPath>
        </defs>
        {/* Horizon */}
        <line x1="8" y1="104" x2="212" y2="104" stroke="var(--color-card-border)" strokeWidth="1" />
        {/* Full day track */}
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="var(--color-track)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Elapsed daylight sweep, drawn in on mount, stopped a hair short of the sun itself —
            running the thick line straight into the ball made it look like a lollipop. */}
        {sunUp && (
          <motion.path
            d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            initial={{ strokeDashoffset: ARC_LENGTH }}
            animate={{ strokeDashoffset: ARC_LENGTH - Math.max(0, fraction * ARC_LENGTH - CORE_RADIUS - 2) }}
            transition={sweepTransition}
          />
        )}
        {/* The sun itself: a wide, subtle bloom behind a clean gradient-lit core. */}
        {sunVisible && (
          <motion.g
            initial={entering ? { opacity: 0, scale: 0.4 } : false}
            animate={{ opacity: 1, scale: 1 }}
            transition={sunAppearTransition}
            style={{ transformOrigin: `${sun.x}px ${sun.y}px` }}
          >
            {/* Not clipped by the horizon — clipping a soft gradient circle at a hard line left
                a lopsided "chopped blob" shape whenever the sun neared the edges of the day.
                `glowFade` (a separate wrapper, so it multiplies with the CSS breathing animation
                rather than being overridden by it) fades it out before that would ever show. */}
            <g opacity={glowFade}>
              <circle className="weather-sun-glow" cx={sun.x} cy={sun.y} r={GLOW_RADIUS} fill={`url(#${gradientId}-glow)`} />
            </g>
            {/* The core sinks below the horizon geometrically, via the clip — no fade. */}
            <g clipPath={`url(#${gradientId}-horizon)`}>
              <circle className="weather-sun-dot" cx={sun.x} cy={sun.y} r={CORE_RADIUS} fill={`url(#${gradientId}-core)`} />
              {/* A hairline rim lifts the ball off the line ending inside it, without the thick
                  dark-donut look a full-strength stroke had before. */}
              <circle cx={sun.x} cy={sun.y} r={CORE_RADIUS} fill="none" stroke="var(--color-card)" strokeWidth="0.6" opacity="0.5" />
            </g>
          </motion.g>
        )}
        {/* Sunrise / sunset endpoints */}
        <text x={CX - R} y="115" textAnchor="middle" className="fill-(--color-ink-muted)" fontSize="9" fontWeight="600">
          ↑ {timeLabel(sunrise)}
        </text>
        <text x={CX + R} y="115" textAnchor="middle" className="fill-(--color-ink-muted)" fontSize="9" fontWeight="600">
          ↓ {timeLabel(sunset)}
        </text>
      </svg>
      <p className="mt-2 text-center text-[11px] text-ink-faint">{caption}</p>
    </div>
  );
}

interface MoonDiscProps {
  phaseDeg: number;
  /** Rendered size in CSS pixels. */
  size?: number;
}

/** Lunar maria and craters, drawn once and clipped to whatever part of the disc is lit. */
function MoonSurface() {
  return (
    <>
      {/* Maria: the large dark basins that make the face recognizable */}
      <g fill="light-dark(#334155, #64748b)" opacity="0.22">
        <ellipse cx="-0.28" cy="-0.32" rx="0.34" ry="0.26" transform="rotate(-18 -0.28 -0.32)" />
        <ellipse cx="0.18" cy="-0.1" rx="0.28" ry="0.22" transform="rotate(12 0.18 -0.1)" />
        <ellipse cx="-0.12" cy="0.3" rx="0.22" ry="0.16" transform="rotate(-8 -0.12 0.3)" />
      </g>
      {/* Craters, each with a shifted core so they read as dented, not stamped */}
      <g fill="light-dark(#334155, #475569)">
        <circle cx="0.45" cy="0.38" r="0.11" opacity="0.2" />
        <circle cx="0.47" cy="0.4" r="0.07" opacity="0.22" />
        <circle cx="-0.5" cy="0.18" r="0.08" opacity="0.18" />
        <circle cx="-0.485" cy="0.195" r="0.05" opacity="0.2" />
        <circle cx="0.12" cy="0.58" r="0.06" opacity="0.16" />
        <circle cx="0.58" cy="-0.35" r="0.055" opacity="0.18" />
        <circle cx="-0.15" cy="-0.62" r="0.05" opacity="0.16" />
        <circle cx="0.33" cy="0.15" r="0.04" opacity="0.15" />
      </g>
    </>
  );
}

/**
 * The lit part of the moon as a two-arc path: one limb of the disc plus the
 * terminator, a half-ellipse whose x-radius is |cos(phase)|. 0° new → 180° full.
 */
export function MoonDisc({ phaseDeg, size = 72 }: Readonly<MoonDiscProps>) {
  const prefix = useId().replaceAll(':', '');
  const phase = ((phaseDeg % 360) + 360) % 360;
  const rx = Math.abs(Math.cos((phase * Math.PI) / 180));
  const waxing = phase < 180;
  // Terminator bulges toward +x in quadrants 1 and 3, −x in 2 and 4.
  const termSweep = Math.floor(phase / 90) % 2 === 0 ? 0 : 1;
  const arcSweep = waxing ? 1 : 0;
  const litPath =
    phase === 0
      ? ''
      : `M 0 -1 A 1 1 0 0 ${arcSweep} 0 1 A ${rx} 1 0 0 ${termSweep} 0 -1 Z`;

  return (
    <svg
      viewBox="-1.2 -1.2 2.4 2.4"
      style={{ width: size, height: size }}
      aria-label={`${moonPhaseName(phase)}, ${Math.round(moonIllumination(phase) * 100)}% illuminated`}
    >
      <defs>
        <radialGradient id={`${prefix}-dark`} cx="38%" cy="32%" r="80%">
          <stop offset="0" stopColor="light-dark(#dbe2ec, #232c3b)" />
          <stop offset="1" stopColor="light-dark(#c6cfdd, #131a26)" />
        </radialGradient>
        <radialGradient id={`${prefix}-lit`} cx="38%" cy="32%" r="85%">
          <stop offset="0" stopColor="light-dark(#a7b4c8, #fdfdf9)" />
          <stop offset="0.75" stopColor="light-dark(#8b9ab2, #e2e8f2)" />
          <stop offset="1" stopColor="light-dark(#7688a3, #b9c3d6)" />
        </radialGradient>
        <clipPath id={`${prefix}-disc`}>
          <circle r="1" />
        </clipPath>
        <clipPath id={`${prefix}-litclip`}>
          {litPath ? <path d={litPath} /> : <rect x="0" y="0" width="0" height="0" />}
        </clipPath>
        {/* Softens only the terminator; the outer limb stays crisp thanks to the disc clip */}
        <filter id={`${prefix}-soft`}>
          <feGaussianBlur stdDeviation="0.025" />
        </filter>
      </defs>
      {/* Dark side, faintly visible the way earthshine renders it */}
      <circle r="1" fill={`url(#${prefix}-dark)`} />
      <g clipPath={`url(#${prefix}-disc)`} opacity="0.35">
        <MoonSurface />
      </g>
      {/* Lit side */}
      {litPath && (
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.25 }}>
          <g clipPath={`url(#${prefix}-disc)`}>
            <path d={litPath} fill={`url(#${prefix}-lit)`} filter={`url(#${prefix}-soft)`} />
          </g>
          <g clipPath={`url(#${prefix}-litclip)`}>
            <MoonSurface />
          </g>
        </motion.g>
      )}
      <circle r="1" fill="none" stroke="var(--color-card-border)" strokeWidth="0.02" />
    </svg>
  );
}

const SYNODIC_DAYS = 29.53;

/** Days until the moon reaches a target phase angle, walking forward through the lunation. */
function daysUntilPhase(phaseDeg: number, targetDeg: number): number {
  return ((((targetDeg - phaseDeg) % 360) + 360) % 360 / 360) * SYNODIC_DAYS;
}

function nextMoonEventLabel(phaseDeg: number): string {
  const toFull = daysUntilPhase(phaseDeg, 180);
  const toNew = daysUntilPhase(phaseDeg, 360);
  const [days, name] = toFull <= toNew ? [toFull, 'full moon'] : [toNew, 'new moon'];
  if (days < 1) return `${name} tonight`;
  const rounded = Math.round(days);
  return `${name} in ${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

/** Disc sized to stand on its own next to the full-width sun arc, not shrunk down as an aside. */
export function MoonPanel({ moon }: Readonly<{ moon: NonNullable<WeatherData['moon']> }>) {
  const illumination = Math.round(moonIllumination(moon.phaseDeg) * 100);
  return (
    <div className="flex items-center gap-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 }}
        className="shrink-0"
        style={{
          filter: `drop-shadow(0 0 ${5 + illumination * 0.14}px light-dark(rgb(118 136 163 / ${0.12 + illumination * 0.003}), rgb(231 237 248 / ${0.1 + illumination * 0.004})))`,
        }}
      >
        <MoonDisc phaseDeg={moon.phaseDeg} size={92} />
      </motion.div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tracking-[-0.01em]">{moonPhaseName(moon.phaseDeg)}</p>
        <p className="mt-1 truncate text-xs text-ink-muted">
          {illumination}% lit · {nextMoonEventLabel(moon.phaseDeg)}
        </p>
        {(moon.moonrise || moon.moonset) && (
          <p className="mt-1 truncate text-xs tabular-nums text-ink-faint">
            {moon.moonrise ? `↑ ${timeLabel(moon.moonrise)}` : 'no moonrise today'}
            {moon.moonrise && moon.moonset && '   '}
            {moon.moonset && `↓ ${timeLabel(moon.moonset)}`}
          </p>
        )}
      </div>
    </div>
  );
}
