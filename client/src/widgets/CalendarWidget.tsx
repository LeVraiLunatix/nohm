import { useMemo, useState } from 'react';
import type { CalendarData } from '@nohm/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { mapsSearchHref } from '../lib/maps';
import { formatEventDate } from '../lib/time';

type CalendarEvent = CalendarData['events'][number];

/** Stable per-calendar dot color derived from the calendar's name; readable in both modes. */
function calendarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = Math.trunc(hash * 31 + (char.codePointAt(0) ?? 0));
  const hue = Math.abs(hash) % 360;
  return `light-dark(hsl(${hue} 55% 42%), hsl(${hue} 55% 65%))`;
}

function NoteIcon() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="mt-0.5 h-3.5 w-3.5 shrink-0">
      <path d="M3.5 2.75h9v10.5h-9zM5.5 6h5M5.5 8.5h5" />
    </svg>
  );
}

function ChevronIcon({ direction }: Readonly<{ direction: 'left' | 'right' }>) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
      <path
        d={direction === 'left' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** How many months either side of the current one the server keeps cached. */
const MAX_MONTH_OFFSET = 12;

function monthReference(offset: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function firstOfMonthKey(offset: number): string {
  return monthReference(offset).toLocaleDateString('en-CA');
}

function todayKey(): string {
  return new Date().toLocaleDateString('en-CA');
}

function dayHeading(date: string): string {
  const todayStr = todayKey();
  const tomorrowStr = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA');
  if (date === todayStr) return 'Today';
  if (date === tomorrowStr) return 'Tomorrow';
  return formatEventDate(date, 'long');
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface GridDay {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

/** Monday-start weeks covering the whole month, padded with the edge days of neighboring months
 *  so every row is a full week. */
function buildMonthGrid(reference: Date): GridDay[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const leadingDays = (monthStart.getDay() + 6) % 7;
  const trailingDays = 6 - ((monthEnd.getDay() + 6) % 7);

  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - leadingDays);
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(gridEnd.getDate() + trailingDays);

  const today = todayKey();
  const days: GridDay[] = [];
  for (const cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
    const key = cursor.toLocaleDateString('en-CA');
    days.push({ key, day: cursor.getDate(), inMonth: cursor.getMonth() === month, isToday: key === today });
  }
  return days;
}

/** All date-grid buckets an event should appear under — every day it spans for multi-day all-day
 *  events (DTEND is exclusive per iCal convention), just its start day otherwise. Reads dates back
 *  through the local calendar (like `event.date` already does), not raw UTC — an all-day event's
 *  instant isn't necessarily UTC midnight, so slicing the ISO string can land on the wrong day. */
function datesForEvent(event: CalendarEvent): string[] {
  if (!event.allDay) return [event.date];
  const endDay = new Date(event.end).toLocaleDateString('en-CA');
  const dates: string[] = [];
  for (
    const cursor = new Date(`${event.date}T12:00:00`);
    cursor.toLocaleDateString('en-CA') < endDay;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    dates.push(cursor.toLocaleDateString('en-CA'));
  }
  return dates.length > 0 ? dates : [event.date];
}

/** One dot per distinct calendar represented that day, not one per event. */
function dotsForDay(events: CalendarEvent[]): string[] {
  const colors = new Map<string, string>();
  for (const event of events) {
    if (!colors.has(event.calendar)) colors.set(event.calendar, calendarColor(event.calendar));
  }
  return [...colors.values()];
}

function EventList({ events }: Readonly<{ events: CalendarEvent[] }>) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-faint">Nothing scheduled.</p>;
  }
  return (
    <ul className="space-y-0.5 text-sm">
      {events.map((event) => (
        <li key={event.id} className="-mx-2 flex gap-3 rounded-xl px-2 py-1.5 transition hover:bg-track">
          <span
            aria-hidden
            title={event.calendar}
            className="w-1 shrink-0 self-stretch rounded-full"
            style={{ backgroundColor: calendarColor(event.calendar) }}
          />
          <span className="w-20 shrink-0 pt-px tabular-nums text-ink-muted">
            {event.allDay ? 'All day' : `${event.startLabel}–${event.endLabel}`}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink">{event.title}</span>
            {event.location && (
              <a
                href={mapsSearchHref(event.location)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-ink-faint transition hover:text-ink"
              >
                <span aria-hidden className="shrink-0">📍</span>
                <span className="truncate">{event.location}</span>
              </a>
            )}
            {event.description && (
              <span className="mt-1.5 flex gap-1.5 border-l border-card-border pl-2 text-xs text-ink-muted">
                <NoteIcon />
                <span className="line-clamp-2 whitespace-pre-line">{event.description}</span>
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The very next event, wherever it falls — including past the visible grid (e.g. early next
 *  month) — so it's never hidden just because the calendar hasn't turned the page yet. */
function UpNext({ events, onSelect }: Readonly<{ events: CalendarEvent[]; onSelect: (date: string) => void }>) {
  const next = events.find((event) => new Date(event.end).getTime() >= Date.now());
  if (!next) return null;
  const when = next.allDay ? dayHeading(next.date) : `${dayHeading(next.date)} · ${next.startLabel}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(next.date)}
      className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full bg-track px-2.5 py-1 text-xs text-ink-muted transition hover:bg-(--color-accent-personal)/15 hover:text-ink"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--color-accent-personal)" />
      <span className="truncate">
        <span className="font-medium text-ink">{next.title}</span> · {when}
      </span>
    </button>
  );
}

export function CalendarWidget() {
  const { envelope, offline } = useWidget<CalendarData>('calendar');
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [monthOffset, setMonthOffset] = useState(0);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of envelope?.data?.events ?? []) {
      for (const dateKey of datesForEvent(event)) {
        const bucket = map.get(dateKey);
        if (bucket) bucket.push(event);
        else map.set(dateKey, [event]);
      }
    }
    return map;
  }, [envelope?.data]);

  function goToMonth(offset: number) {
    const clamped = Math.max(-MAX_MONTH_OFFSET, Math.min(MAX_MONTH_OFFSET, offset));
    setMonthOffset(clamped);
    setSelectedDate(clamped === 0 ? todayKey() : firstOfMonthKey(clamped));
  }

  /** Jump the visible month (if needed) and select an arbitrary date, e.g. from the "up next" chip. */
  function goToDate(date: string) {
    const target = new Date(`${date}T12:00:00`);
    const now = new Date();
    const offset = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    setMonthOffset(Math.max(-MAX_MONTH_OFFSET, Math.min(MAX_MONTH_OFFSET, offset)));
    setSelectedDate(date);
  }

  return (
    <WidgetCard title="Calendar" envelope={envelope} offline={offline}>
      {(data) => {
        const grid = buildMonthGrid(monthReference(monthOffset));
        const monthLabel = monthReference(monthOffset).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        const selectedEvents = eventsByDate.get(selectedDate) ?? [];

        return (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToMonth(monthOffset - 1)}
                  disabled={monthOffset <= -MAX_MONTH_OFFSET}
                  aria-label="Previous month"
                  className="cursor-pointer rounded p-0.5 text-ink-faint transition hover:bg-track hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
                >
                  <ChevronIcon direction="left" />
                </button>
                <p className="w-32 shrink-0 whitespace-nowrap text-center text-sm font-semibold text-ink">{monthLabel}</p>
                <button
                  type="button"
                  onClick={() => goToMonth(monthOffset + 1)}
                  disabled={monthOffset >= MAX_MONTH_OFFSET}
                  aria-label="Next month"
                  className="cursor-pointer rounded p-0.5 text-ink-faint transition hover:bg-track hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
                >
                  <ChevronIcon direction="right" />
                </button>
                <span
                  className={`grid overflow-hidden transition-[grid-template-columns] duration-300 ease-out ${
                    monthOffset === 0 ? 'grid-cols-[0fr]' : 'grid-cols-[1fr]'
                  }`}
                >
                  <span className="overflow-hidden">
                    <button
                      type="button"
                      onClick={() => goToMonth(0)}
                      className="ml-1 block cursor-pointer whitespace-nowrap rounded-full bg-(--color-accent-personal) px-2 py-0.5 text-[10px] font-semibold text-(--color-canvas) transition hover:brightness-110"
                    >
                      Today
                    </button>
                  </span>
                </span>
              </div>
              <UpNext events={data.events} onSelect={goToDate} />
            </div>

            <div>
              <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                {WEEKDAY_LABELS.map((label, index) => (
                  <span key={label} className={index >= 5 ? 'py-1 text-ink-faint/60' : 'py-1'}>{label}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {grid.map((cell, index) => {
                  const dots = dotsForDay(eventsByDate.get(cell.key) ?? []);
                  const isSelected = cell.key === selectedDate;
                  const isWeekend = index % 7 >= 5;
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDate(cell.key)}
                      className={[
                        'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl text-xs transition',
                        !cell.inMonth && 'text-ink-faint/60',
                        cell.inMonth && isWeekend && !cell.isToday && 'text-ink-muted',
                        cell.inMonth && !isWeekend && 'text-ink',
                        isSelected ? 'bg-(--color-accent-personal)/15 ring-1 ring-(--color-accent-personal)' : 'hover:bg-track',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <span
                        className={
                          cell.isToday
                            ? 'flex h-5 w-5 items-center justify-center rounded-full bg-(--color-accent-personal) font-semibold text-(--color-canvas)'
                            : undefined
                        }
                      >
                        {cell.day}
                      </span>
                      <span className="flex h-1.5 gap-0.5">
                        {dots.slice(0, 4).map((color) => (
                          <span key={color} aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-card-border pt-3">
              <h3 className="mb-1 text-xs font-medium text-ink-faint">{dayHeading(selectedDate)}</h3>
              <EventList events={selectedEvents} />
            </div>
          </div>
        );
      }}
    </WidgetCard>
  );
}
