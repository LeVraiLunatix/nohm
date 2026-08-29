import type { WeatherData } from '@nohm/shared';
import { motion } from 'motion/react';
import { PRECIP_COLOR, uvLevel, windCompass } from '../../lib/weather';

const tileVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

function Tile({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <motion.div variants={tileVariants} className="weather-tile">
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      <div className="mt-2">{children}</div>
    </motion.div>
  );
}

/** Compass dial whose needle points where the wind is blowing (MET reports the FROM direction). */
function WindTile({ speed, directionDeg }: Readonly<{ speed: number; directionDeg?: number }>) {
  const toward = directionDeg == null ? null : (directionDeg + 180) % 360;
  return (
    <Tile label="Wind">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 56 56" className="h-14 w-14 shrink-0" aria-hidden>
          <circle cx="28" cy="28" r="24" fill="none" stroke="var(--color-track)" strokeWidth="1.5" />
          {(['N', 'E', 'S', 'W'] as const).map((point, i) => {
            const angle = (i * Math.PI) / 2;
            const x = 28 + Math.sin(angle) * 19;
            const y = 28 - Math.cos(angle) * 19 + 2.6;
            return (
              <text key={point} x={x} y={y} textAnchor="middle" fontSize="6.5" fontWeight="600" className="fill-(--color-ink-faint)">
                {point}
              </text>
            );
          })}
          {toward != null && (
            <g className="weather-compass-needle" style={{ transform: `rotate(${toward}deg)` }}>
              <path d="M28 9 l3.4 8.5 h-6.8 Z" fill="var(--color-accent-weather)" />
              <line x1="28" y1="17" x2="28" y2="40" stroke="var(--color-accent-weather)" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
            </g>
          )}
          <circle cx="28" cy="28" r="2.2" fill="var(--color-ink-faint)" />
        </svg>
        <div>
          <p className="text-2xl font-semibold leading-none">
            {Math.round(speed)} <span className="text-xs font-medium text-ink-faint">m/s</span>
          </p>
          {directionDeg != null && <p className="mt-1 text-xs text-ink-muted">from {windCompass(directionDeg)}</p>}
        </div>
      </div>
    </Tile>
  );
}

function HumidityTile({ humidity }: Readonly<{ humidity: number }>) {
  return (
    <Tile label="Humidity">
      <p className="text-2xl font-semibold leading-none">
        {Math.round(humidity)}<span className="text-xs font-medium text-ink-faint">%</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
        <motion.div
          className="h-full rounded-full"
          style={{ background: PRECIP_COLOR }}
          initial={{ width: 0 }}
          animate={{ width: `${humidity}%` }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">relative humidity</p>
    </Tile>
  );
}

/** Half-circle gauge over the 0–11+ UV scale; the WHO band color always ships with its label. */
function UvTile({ uvIndex }: Readonly<{ uvIndex: number }>) {
  const level = uvLevel(uvIndex);
  const fraction = Math.min(uvIndex / 11, 1);
  const r = 24;
  const arc = Math.PI * r;
  return (
    <Tile label="UV index">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 56 34" className="h-12 w-16 shrink-0" aria-hidden>
          <path d={`M 4 30 A ${r} ${r} 0 0 1 52 30`} fill="none" stroke="var(--color-track)" strokeWidth="4" strokeLinecap="round" />
          <motion.path
            d={`M 4 30 A ${r} ${r} 0 0 1 52 30`}
            fill="none"
            stroke={level.color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={arc}
            initial={{ strokeDashoffset: arc }}
            animate={{ strokeDashoffset: arc * (1 - fraction) }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
          />
        </svg>
        <div>
          <p className="text-2xl font-semibold leading-none">{uvIndex.toFixed(1)}</p>
          <p className="mt-1 text-xs text-ink-muted">{level.label}</p>
        </div>
      </div>
    </Tile>
  );
}

function PrecipitationTile({ data }: Readonly<{ data: WeatherData }>) {
  const next12h = Math.round(data.hours.slice(0, 12).reduce((sum, hour) => sum + hour.precipitationMm, 0) * 10) / 10;
  const nextHour = data.current.precipitationMm ?? data.hours[0]?.precipitationMm ?? 0;
  return (
    <Tile label="Precipitation">
      <p className="text-2xl font-semibold leading-none">
        {nextHour} <span className="text-xs font-medium text-ink-faint">mm next hour</span>
      </p>
      <p className="mt-1.5 text-xs text-ink-muted">
        {next12h > 0 ? `${next12h} mm over the next 12 h` : 'nothing expected in the next 12 h'}
      </p>
    </Tile>
  );
}

export function ConditionTiles({ data }: Readonly<{ data: WeatherData }>) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } } }}
    >
      <WindTile speed={data.current.windSpeed} directionDeg={data.current.windDirectionDeg} />
      {data.current.humidity != null && <HumidityTile humidity={data.current.humidity} />}
      {data.current.uvIndex != null && <UvTile uvIndex={data.current.uvIndex} />}
      <PrecipitationTile data={data} />
    </motion.div>
  );
}
