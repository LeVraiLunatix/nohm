import type { HueData, PowerData, SystemData, TransitData } from '@nohm/shared';
import { hhmm, mulberry32 } from '@nohm/shared';

// ── Hue ──────────────────────────────────────────────────────────────────────────────────────

export function hue(): HueData {
  return {
    lights: [
      { id: 'l1', name: 'Living room lamp', on: true, brightness: 72, reachable: true },
      { id: 'l2', name: 'Desk lamp', on: true, brightness: 55, reachable: true },
      { id: 'l3', name: 'Bedroom ceiling', on: false, brightness: 40, reachable: true },
      { id: 'l4', name: 'Hallway', on: false, brightness: 20, reachable: true },
    ],
    rooms: [
      { id: 'r1', name: 'Living room', anyOn: true },
      { id: 'r2', name: 'Bedroom', anyOn: false },
    ],
    scenes: [
      { id: 's1', name: 'Relax', room: 'Living room', colors: ['#f7b955', '#f2914a'] },
      { id: 's2', name: 'Focus', room: 'Living room', colors: ['#bfe4ff', '#ffffff'] },
      { id: 's3', name: 'Night', room: 'Bedroom', colors: ['#5a3ea8', '#28204f'] },
    ],
  };
}

// ── Transit ──────────────────────────────────────────────────────────────────────────────────

export function transit(now: Date): TransitData {
  const departure = (minutesFromNow: number, realtime: boolean) => {
    const aimed = new Date(now.getTime() + minutesFromNow * 60_000);
    const delayMs = minutesFromNow % 2 === 0 ? 60_000 : 0;
    const expected = realtime ? new Date(aimed.getTime() + delayMs) : aimed;
    return { aimedTime: aimed.toISOString(), expectedTime: expected.toISOString(), realtime };
  };
  return {
    stops: [
      {
        id: 'NSR:StopPlace:41613', name: 'Jernbanetorget', distanceMeters: 180,
        departures: [
          { line: '12', destination: 'Majorstuen', mode: 'tram', color: '#0072ce', ...departure(3, true) },
          { line: '2', destination: 'Ellingsrudåsen', mode: 'metro', color: '#e6231e', ...departure(7, true) },
          { line: '17', destination: 'Rikshospitalet', mode: 'tram', color: '#0072ce', ...departure(12, false) },
        ],
      },
      {
        id: 'NSR:StopPlace:43501', name: 'Stortinget', distanceMeters: 420,
        departures: [
          { line: '31', destination: 'Fornebu', mode: 'bus', color: '#e6231e', ...departure(5, true) },
          { line: '4', destination: 'Bergkrystallen', mode: 'metro', color: '#e6231e', ...departure(9, true) },
        ],
      },
    ],
  };
}

// ── Power ────────────────────────────────────────────────────────────────────────────────────

function powerPriceBase(hour: number): number {
  if (hour >= 7 && hour <= 9) return 1.4;
  if (hour >= 17 && hour <= 20) return 1.6;
  if (hour >= 0 && hour <= 5) return 0.4;
  return 0.8;
}

function powerHours(now: Date, dayOffset: number, rng: () => number) {
  return Array.from({ length: 24 }, (_, hour) => {
    const time = new Date(now);
    time.setDate(time.getDate() + dayOffset);
    time.setHours(hour, 0, 0, 0);
    const base = powerPriceBase(hour);
    return { time: time.toISOString(), hourLabel: String(hour).padStart(2, '0'), priceNokPerKwh: Math.max(0.05, Math.round((base + (rng() - 0.5) * 0.3) * 100) / 100) };
  });
}

export function power(now: Date): PowerData {
  const rng = mulberry32(555);
  return { area: 'NO1', today: powerHours(now, 0, rng), tomorrow: now.getHours() >= 13 ? powerHours(now, 1, rng) : [] };
}

// ── System ───────────────────────────────────────────────────────────────────────────────────

export function system(now: Date): SystemData {
  return {
    hostname: 'demo-mac', platform: 'darwin', nodeVersion: 'v22.11.0',
    uptimeSeconds: 3 * 86_400 + 4 * 3_600, timezone: 'Europe/Oslo',
    serverTime: hhmm(now),
  };
}

