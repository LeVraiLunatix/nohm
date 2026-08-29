import { describe, expect, it } from 'vitest';
import type { CalendarData } from '@nohm/shared';
import { calendarCandidates } from './calendar.js';

describe('calendarCandidates', () => {
  const now = Date.parse('2026-07-18T12:00:00+02:00');
  const event = (id: string, start: string, end: string, overrides: Partial<CalendarData['events'][number]> = {}) => ({
    id, title: `Event ${id}`, calendar: 'Calendar', allDay: false,
    start, end, date: start.slice(0, 10), startLabel: '12:00', endLabel: '13:00', ...overrides,
  });

  it('surfaces the nearest upcoming event as the hero candidate', () => {
    const data: CalendarData = {
      events: [event('a', '2026-07-19T09:00:00+02:00', '2026-07-19T10:00:00+02:00')],
    };

    expect(calendarCandidates(data, now)).toEqual([expect.objectContaining({
      kicker: 'Next on deck', title: 'Event a', score: 96,
    })]);
  });

  it('stays quiet for events months away with nothing sooner on the calendar', () => {
    const data: CalendarData = {
      events: [event('far', '2026-11-20T09:00:00+01:00', '2026-11-20T10:00:00+01:00')],
    };

    expect(calendarCandidates(data, now)).toEqual([]);
  });

  it('drops far-future events from the agenda but keeps near-term ones', () => {
    const data: CalendarData = {
      events: [
        event('a', '2026-07-19T09:00:00+02:00', '2026-07-19T10:00:00+02:00'),
        event('b', '2026-07-20T09:00:00+02:00', '2026-07-20T10:00:00+02:00'),
        event('far', '2026-11-20T09:00:00+01:00', '2026-11-20T10:00:00+01:00'),
      ],
    };

    const candidates = calendarCandidates(data, now);
    expect(candidates).toEqual([
      expect.objectContaining({ kicker: 'Next on deck', title: 'Event a' }),
      expect.objectContaining({ kicker: 'Coming up', title: '1 more on your calendar', detail: 'Event b' }),
    ]);
  });
});
