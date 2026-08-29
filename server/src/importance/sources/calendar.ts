import type { CalendarData } from '@nohm/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

/** How far out an event can be and still count as "what's next" — beyond this it's noise, not news. */
const NEAR_HORIZON_MS = 14 * 24 * 60 * 60_000;

export function calendarCandidates(data: CalendarData | undefined, now: number): Candidate[] {
  const events = data?.events.filter((event) => {
    const end = Date.parse(event.end);
    return end >= now && Date.parse(event.start) - now <= NEAR_HORIZON_MS;
  }) ?? [];
  const next = events[0];
  const agenda = events.slice(1, 5);
  const candidates: Candidate[] = [];
  if (next) {
    candidates.push({
      id: `calendar:event:${next.id}`, source: 'calendar', kind: 'calendar', score: 96, shapes: [...allShapes],
      kicker: 'Next on deck', title: next.title,
      detail: [next.location, next.description].filter((detail): detail is string => Boolean(detail)).join(' · ')
        || (next.allDay ? 'An all-day marker on your calendar' : `${next.startLabel}–${next.endLabel}`),
      href: '#/personal/calendar', render: { type: 'calendar-event', eventId: next.id },
    });
  }
  if (agenda.length) {
    candidates.push({
      id: `calendar:agenda:${agenda.map((event) => event.id).join(',')}`, source: 'calendar', kind: 'calendar', score: 78,
      shapes: ['secondary', 'tile'], kicker: 'Coming up', title: `${agenda.length} more on your calendar`,
      detail: agenda[0].title, href: '#/personal/calendar', render: { type: 'calendar-agenda', eventIds: agenda.map((event) => event.id) },
    });
  }
  return candidates;
}
