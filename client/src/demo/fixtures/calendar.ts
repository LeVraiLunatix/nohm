import type { CalendarData } from '@nohm/shared';
import { daysFromNowAt, hhmm } from '@nohm/shared';

// ── Calendar — spread across last month/this month/next month so month nav isn't empty ────────

export function calendar(now: Date): CalendarData {
  const events: CalendarData['events'] = [];
  let n = 0;
  const add = (title: string, cal: string, days: number, hour: number, minute: number, durationMin: number, opts: { location?: string; description?: string; allDay?: boolean } = {}) => {
    n += 1;
    const start = daysFromNowAt(now, days, hour, minute);
    const end = new Date(start.getTime() + durationMin * 60_000);
    events.push({
      id: `ev${n}`, title, calendar: cal, allDay: opts.allDay ?? false,
      location: opts.location, description: opts.description,
      start: start.toISOString(), end: end.toISOString(),
      date: start.toISOString().slice(0, 10), startLabel: hhmm(start), endLabel: hhmm(end),
    });
  };

  add('Cinema — The Odyssey', 'Personal', 1, 19, 15, 173, { location: 'Northstar Cinema', description: '2h 53m · with Sam' });
  add('Team standup', 'Work', 2, 9, 30, 30, { location: 'Video call' });
  add('Dentist appointment', 'Personal', 4, 11, 0, 45, { location: 'Bright Smile Dental' });
  add('Sprint planning', 'Work', 5, 10, 0, 60, { location: 'Video call' });
  add('Dinner with Alex', 'Personal', 7, 19, 0, 120, { location: 'Riverside Bistro' });
  add('Quarterly review', 'Work', 9, 14, 0, 90, { location: 'Conference room B' });
  add("Sam's birthday", 'Personal', 12, 0, 0, 0, { allDay: true });
  add('Gym — leg day', 'Personal', 3, 7, 0, 60, {});
  add('1:1 with manager', 'Work', 6, 15, 30, 30, { location: 'Video call' });
  add('Weekend hike', 'Personal', 6, 9, 0, 240, { location: 'Nordmarka trailhead' });
  add('Code review', 'Work', 1, 13, 0, 45, {});
  add('Grocery run', 'Personal', 0, 17, 30, 30, { location: 'Meny Grünerløkka', description: 'Restock the week — fridge, produce, coffee' });
  add('Design sync', 'Work', -3, 11, 0, 45, {});
  add('Coffee with old coworker', 'Personal', -5, 10, 0, 60, { location: 'Fuglen' });
  add('Deploy freeze starts', 'Work', 14, 0, 0, 0, { allDay: true });
  add('Concert — outdoor stage', 'Personal', 18, 20, 0, 150, { location: 'Frognerparken' });
  add('Retro', 'Work', -1, 16, 0, 45, {});
  add('Vet checkup', 'Personal', 9, 12, 0, 30, { location: 'Green Paw Clinic' });

  events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return { events };
}

