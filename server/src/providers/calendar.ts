import { createDAVClient } from 'tsdav';
import ical from 'node-ical';
import { calendarSchema, type CalendarData } from '@nohm/shared';
import type { Provider } from '../scheduler.js';

const MAX_EVENTS = 2000;

type CalendarEvent = CalendarData['events'][number];
type ExpandedEvent = { event: VEvent; start: Date; end: Date };
type DateFormatter = Intl.DateTimeFormat;

/** Minutes-offset of a timezone at a given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - instant.getTime();
}

/** A Date whose UTC fields hold wall-clock time in `timeZone` → real instant. */
function wallTimeToInstant(wall: Date, timeZone: string): Date {
  const guess = new Date(wall.getTime() - tzOffsetMs(wall, timeZone));
  const corrected = new Date(wall.getTime() - tzOffsetMs(guess, timeZone));
  return corrected;
}

interface VEvent {
  type: 'VEVENT';
  uid: string;
  summary?: string | { val: string };
  location?: string;
  description?: string | { val: string };
  status?: string;
  datetype?: string;
  start: Date & { tz?: string };
  end?: Date;
  rrule?: {
    between(after: Date, before: Date, inc?: boolean): Date[];
    origOptions: { tzid?: string };
  };
  exdate?: Record<string, Date>;
  recurrences?: Record<string, VEvent>;
}

const text = (value: string | { val: string } | undefined): string =>
  typeof value === 'object' ? value.val : (value ?? '');

/**
 * rrule occurrences come back with the wall-clock of the event start encoded in
 * UTC fields (tz-aware rules) or drifting with the server's DST (floating
 * rules) — both need correcting to real instants.
 */
function fixOccurrence(occ: Date, event: VEvent): Date {
  const tzid = event.rrule?.origOptions.tzid;
  if (tzid) return wallTimeToInstant(occ, tzid);
  const driftMin = occ.getTimezoneOffset() - event.start.getTimezoneOffset();
  return new Date(occ.getTime() - driftMin * 60_000);
}

function expandEvent(
  event: VEvent,
  calendarName: string,
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedEvent[] {
  const durationMs = (event.end?.getTime() ?? event.start.getTime()) - event.start.getTime();

  if (!event.rrule) {
    const end = new Date(event.start.getTime() + durationMs);
    return end > rangeStart && event.start < rangeEnd
      ? [{ event, start: event.start, end }]
      : [];
  }

  // Widen the query so occurrences straddling the range edges survive fixup.
  const occurrences = event.rrule.between(
    new Date(rangeStart.getTime() - 86_400_000),
    new Date(rangeEnd.getTime() + 86_400_000),
    true,
  );
  const results: ExpandedEvent[] = [];
  for (const raw of occurrences) {
    const dateKey = raw.toISOString().slice(0, 10);
    if (event.exdate?.[dateKey]) continue;

    const override = event.recurrences?.[dateKey];
    const start = override ? override.start : fixOccurrence(raw, event);
    const overrideDuration = override
      ? (override.end?.getTime() ?? start.getTime()) - override.start.getTime()
      : durationMs;
    const end = override?.end ?? new Date(start.getTime() + overrideDuration);
    if (end > rangeStart && start < rangeEnd) {
      results.push({ event: override ?? event, start, end });
    }
  }
  return results;
}

/**
 * Total order over events, so the same set always serializes to the same bytes.
 *
 * The `id` tiebreak is not cosmetic. Events sharing a start time are extremely common (a lecture
 * and its lab, two all-day entries), and the event groups are assembled from concurrent fetches
 * whose resolution order varies between polls. Ordering on `start` alone therefore emitted the same
 * events in a different order almost every poll, which `signalHistory` correctly read as a changed
 * payload and archived: 231 MB of one calendar reshuffled, and not one distinct event set among it.
 * `id` is `${uid}-${start.toISOString()}`, unique and stable per occurrence.
 */
export function compareCalendarEvents(a: CalendarEvent, b: CalendarEvent): number {
  return a.start.localeCompare(b.start) || a.id.localeCompare(b.id);
}

function eventFromOccurrence(
  occurrence: ExpandedEvent,
  calendarName: string,
  dateFmt: DateFormatter,
  timeFmt: DateFormatter,
): CalendarEvent {
  const { event, start, end } = occurrence;
  const allDay = event.datetype === 'date';
  return {
    id: `${event.uid}-${start.toISOString()}`,
    title: text(event.summary) || '(untitled)',
    calendar: calendarName,
    allDay,
    location: text(event.location).trim() || undefined,
    description: text(event.description).trim() || undefined,
    start: start.toISOString(),
    end: end.toISOString(),
    // node-ical parses date-only (VALUE=DATE) fields as local midnight in the server's OS
    // timezone, not UTC midnight, so its instant must be read back through the dashboard
    // timezone formatter rather than sliced off the raw ISO string (which silently lands on
    // the previous day whenever the OS timezone is ahead of UTC).
    date: dateFmt.format(start),
    startLabel: allDay ? 'all day' : timeFmt.format(start),
    endLabel: allDay ? '' : timeFmt.format(end),
  };
}

function eventsForComponent(
  component: VEvent,
  calendarName: string,
  rangeStart: Date,
  rangeEnd: Date,
  dateFmt: DateFormatter,
  timeFmt: DateFormatter,
): CalendarEvent[] {
  if (component.type !== 'VEVENT' || component.status === 'CANCELLED') return [];
  return expandEvent(component, calendarName, rangeStart, rangeEnd)
    .map((occurrence) => eventFromOccurrence(occurrence, calendarName, dateFmt, timeFmt));
}

function eventsForCalendarObject(
  data: string | undefined,
  calendarName: string,
  rangeStart: Date,
  rangeEnd: Date,
  dateFmt: DateFormatter,
  timeFmt: DateFormatter,
): CalendarEvent[] {
  if (!data) return [];
  const parsed = ical.sync.parseICS(data) as Record<string, VEvent>;
  return Object.values(parsed).flatMap((component) =>
    eventsForComponent(component, calendarName, rangeStart, rangeEnd, dateFmt, timeFmt));
}

/** How many months either side of the current one the client is allowed to page to. */
const MONTH_RANGE = 12;

/**
 * The display range spanning MONTH_RANGE months either side of the current one, each grid
 * Monday-start and padded to whole weeks, in the dashboard's timezone, expressed as UTC day
 * boundaries — wide enough that the client can page between them from cached data, with no
 * per-request fetch.
 */
function monthGridRange(now: Date, dateFmt: DateFormatter): { start: Date; end: Date } {
  const [year, month] = dateFmt.format(now).split('-').map(Number);
  const rangeStartMonth = new Date(Date.UTC(year, month - 1 - MONTH_RANGE, 1));
  const rangeEndMonth = new Date(Date.UTC(year, month + MONTH_RANGE, 0));
  const leadingDays = (rangeStartMonth.getUTCDay() + 6) % 7;
  const trailingDays = 6 - ((rangeEndMonth.getUTCDay() + 6) % 7);
  const start = new Date(rangeStartMonth.getTime() - leadingDays * 86_400_000);
  const end = new Date(rangeEndMonth.getTime() + (trailingDays + 1) * 86_400_000);
  return { start, end };
}

/**
 * Apple's Birthdays and Holidays calendars are synthesized client-side (from Contacts, and from a
 * bundled regional feed respectively) and never show up as CalDAV collections — `fetchCalendars()`
 * genuinely never returns them, confirmed by listing this account's calendars directly. A public
 * .ics subscription feed is the practical way to get those sources, and also covers
 * third-party subscriptions that iCloud does not expose over CalDAV. Failures here are
 * swallowed so a slow/unreachable third-party feed never takes down the user's own calendar data.
 */
async function fetchIcsFeedEvents(
  feed: { name: string; url: string },
  rangeStart: Date,
  rangeEnd: Date,
  dateFmt: DateFormatter,
  timeFmt: DateFormatter,
  signal: AbortSignal,
): Promise<CalendarEvent[]> {
  try {
    const res = await fetch(feed.url, { signal });
    if (!res.ok) throw new Error(`feed responded ${res.status}`);
    const data = await res.text();
    return eventsForCalendarObject(data, feed.name, rangeStart, rangeEnd, dateFmt, timeFmt);
  } catch (err) {
    console.warn(`⚠️  Could not fetch ${feed.name} calendar feed — skipping.`, err);
    return [];
  }
}

/** A contact's `BDAY` field, month/day always known — year only when the contact recorded one. */
export function parseVCardBirthday(
  data: string | undefined,
): { name: string; month: number; day: number; year?: number } | undefined {
  if (!data) return undefined;
  const lines = data.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r\n|\n/);

  const bdayLine = lines.find((line) => /^BDAY[;:]/i.test(line));
  if (!bdayLine) return undefined;
  const value = bdayLine.slice(bdayLine.indexOf(':') + 1).trim();
  const match = /^(\d{4}|--)-?(\d{2})-?(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, yearPart, monthPart, dayPart] = match;
  const month = Number(monthPart);
  const day = Number(dayPart);
  if (!month || !day) return undefined;

  const fnLine = lines.find((line) => /^FN:/i.test(line));
  const name = fnLine?.slice(3).trim();
  if (!name) return undefined;

  return { name, month, day, year: yearPart === '--' ? undefined : Number(yearPart) };
}

/** Every occurrence of one contact's birthday that falls within the requested range. */
function birthdayEventsForContact(
  vcard: { url: string; data?: string },
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
  dateFmt: DateFormatter,
): CalendarEvent[] {
  const birthday = parseVCardBirthday(vcard.data);
  if (!birthday) return [];
  const { name, month, day, year } = birthday;

  const events: CalendarEvent[] = [];
  const startYear = rangeStart.getUTCFullYear() - 1;
  const endYear = rangeEnd.getUTCFullYear() + 1;
  for (let occurrenceYear = startYear; occurrenceYear <= endYear; occurrenceYear += 1) {
    const start = wallTimeToInstant(new Date(Date.UTC(occurrenceYear, month - 1, day)), timezone);
    if (start < rangeStart || start >= rangeEnd) continue;
    const end = wallTimeToInstant(new Date(Date.UTC(occurrenceYear, month - 1, day + 1)), timezone);
    const age = year !== undefined ? occurrenceYear - year : undefined;
    events.push({
      id: `birthday:${vcard.url}:${occurrenceYear}`,
      title: `${name}'s birthday`,
      calendar: 'Birthdays',
      allDay: true,
      location: undefined,
      description: age !== undefined && age > 0 ? `Turns ${age}` : undefined,
      start: start.toISOString(),
      end: end.toISOString(),
      date: dateFmt.format(start),
      startLabel: 'all day',
      endLabel: '',
    });
  }
  return events;
}

/**
 * Apple's Birthdays calendar is synthesized on-device from the Contacts app — it's not a CalDAV
 * collection either, but unlike Holidays there's no substitute public feed: the data only exists
 * in this account's own address book, reachable over CardDAV (a separate protocol/endpoint from
 * the CalDAV used for events) with the same iCloud app-password credentials.
 */
async function fetchBirthdayEvents(
  auth: { username: string; password: string },
  race: <T>(promise: Promise<T>) => Promise<T>,
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
  dateFmt: DateFormatter,
): Promise<CalendarEvent[]> {
  try {
    const client = await race(
      createDAVClient({
        serverUrl: 'https://contacts.icloud.com',
        credentials: { username: auth.username, password: auth.password },
        authMethod: 'Basic',
        defaultAccountType: 'carddav',
      }),
    );
    const addressBooks = await race(client.fetchAddressBooks());
    const vcardGroups = await Promise.all(
      addressBooks.map((addressBook) => race(client.fetchVCards({ addressBook }))),
    );

    return vcardGroups
      .flat()
      .flatMap((vcard) => birthdayEventsForContact(vcard, rangeStart, rangeEnd, timezone, dateFmt));
  } catch (err) {
    console.warn('⚠️  Could not fetch birthdays from Contacts — skipping.', err);
    return [];
  }
}

export function createCalendarProvider(
  auth: { username: string; password: string } | undefined,
  allowlist: string[],
  timezone: string,
  holidayIcsUrl?: string,
  includeBirthdays = false,
  icsFeeds: { name: string; url: string }[] = [],
): Provider<CalendarData> {
  const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return {
    id: 'calendar',
    schema: calendarSchema,
    refreshMs: 5 * 60_000,
    timeoutMs: 30_000,
    isConfigured: () => auth !== undefined || holidayIcsUrl !== undefined || icsFeeds.length > 0,
    async fetch(signal) {
      if (!auth && !holidayIcsUrl && icsFeeds.length === 0) throw new Error('calendar is not configured');

      // tsdav can't take an AbortSignal; reject on abort so the scheduler's
      // timeout still lands (the underlying request is simply left behind).
      const aborted = new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      });
      const race = <T>(promise: Promise<T>) => Promise.race([promise, aborted]);

      const { start: rangeStart, end: rangeEnd } = monthGridRange(new Date(), dateFmt);
      const eventGroups: CalendarEvent[][] = [];
      if (auth) {
        const client = await race(
          createDAVClient({
            serverUrl: 'https://caldav.icloud.com',
            credentials: { username: auth.username, password: auth.password },
            authMethod: 'Basic',
            defaultAccountType: 'caldav',
          }),
        );
        const calendars = (await race(client.fetchCalendars())).filter((calendar) => {
          const name = text(calendar.displayName as string | undefined);
          const holdsEvents =
            !calendar.components || calendar.components.includes('VEVENT');
          return holdsEvents && (allowlist.length === 0 || allowlist.includes(name));
        });
        eventGroups.push(...await Promise.all(calendars.map(async (calendar) => {
          const calendarName = text(calendar.displayName as string | undefined) || 'Calendar';
          const objects = await race(client.fetchCalendarObjects({
            calendar,
            timeRange: { start: rangeStart.toISOString(), end: rangeEnd.toISOString() },
          }));
          return objects.flatMap((object) =>
            eventsForCalendarObject(object.data, calendarName, rangeStart, rangeEnd, dateFmt, timeFmt));
        })));
      }
      if (holidayIcsUrl && (allowlist.length === 0 || allowlist.includes('Holidays'))) {
        eventGroups.push(
          await fetchIcsFeedEvents({ name: 'Holidays', url: holidayIcsUrl }, rangeStart, rangeEnd, dateFmt, timeFmt, signal),
        );
      }
      const selectedIcsFeeds = icsFeeds.filter((feed) => allowlist.length === 0 || allowlist.includes(feed.name));
      eventGroups.push(...await Promise.all(selectedIcsFeeds.map((feed) =>
        fetchIcsFeedEvents(feed, rangeStart, rangeEnd, dateFmt, timeFmt, signal),
      )));
      if (auth && includeBirthdays && (allowlist.length === 0 || allowlist.includes('Birthdays'))) {
        eventGroups.push(
          await fetchBirthdayEvents(auth, race, rangeStart, rangeEnd, timezone, dateFmt),
        );
      }
      const events = eventGroups.flat();

      events.sort(compareCalendarEvents);
      return { events: events.slice(0, MAX_EVENTS) };
    },
  };
}
