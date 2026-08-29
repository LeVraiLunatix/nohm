import { useEffect, useState } from 'react';
import type { TransitData, TransitDeparture, TransitStop } from '@nohm/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';

/** Countdown labels drift between polls, so re-render on a clock of our own too. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Real-time departures read as a countdown; schedule-only ones as their timetable time. */
function departureLabel(departure: TransitDeparture, now: number): string {
  const clockTime = new Date(departure.expectedTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (!departure.realtime) return clockTime;
  const minutes = Math.round((Date.parse(departure.expectedTime) - now) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes > 30) return clockTime;
  return `${minutes} min`;
}

function LineChip({ departure }: Readonly<{ departure: TransitDeparture }>) {
  return (
    <span
      className="inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums"
      style={departure.color
        ? { backgroundColor: departure.color, color: '#fff' }
        : { backgroundColor: 'var(--color-track)', color: 'var(--color-ink)' }}
    >
      {departure.line}
    </span>
  );
}

function StopDepartures({ stop, now }: Readonly<{ stop: TransitStop; now: number }>) {
  // The cache can be up to a minute old — drop anything that has already left.
  const upcoming = stop.departures.filter((departure) => Date.parse(departure.expectedTime) > now - 30_000);
  return (
    <div>
      <p className="mb-1.5 flex items-baseline gap-2 text-xs font-semibold text-ink-muted">
        {stop.name}
        {stop.distanceMeters !== undefined && (
          <span className="font-normal text-ink-faint">{stop.distanceMeters} m</span>
        )}
      </p>
      {upcoming.length > 0 ? (
        <ul className="space-y-1.5">
          {upcoming.map((departure) => (
            <li key={`${departure.line}:${departure.destination}:${departure.aimedTime}`} className="flex items-center gap-2 text-sm">
              <LineChip departure={departure} />
              <span className="min-w-0 flex-1 truncate text-ink">{departure.destination}</span>
              <span className={`shrink-0 text-right tabular-nums ${departure.realtime ? 'font-medium text-ink' : 'text-ink-faint'}`}>
                {departureLabel(departure, now)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-faint">No departures in the next few hours.</p>
      )}
    </div>
  );
}

export function TransitWidget() {
  const { envelope, offline } = useWidget<TransitData>('transit');
  const now = useNow();

  return (
    <WidgetCard title="Departures" envelope={envelope} offline={offline}>
      {(data) => (
        <div className="space-y-4">
          {data.stops.map((stop) => (
            <StopDepartures key={stop.id} stop={stop} now={now} />
          ))}
          {data.stops.length === 0 && <p className="text-sm text-ink-faint">No stops found nearby.</p>}
        </div>
      )}
    </WidgetCard>
  );
}
