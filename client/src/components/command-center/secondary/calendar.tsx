import type { ReactNode } from 'react';
import type { CalendarData, CommandCenterSlot } from '@nohm/shared';
import { formatEventDate } from '../../../lib/time';

function formatEventDay(event: CalendarData['events'][number]): string {
  const today = new Date().toLocaleDateString('en-CA');
  if (event.date === today) return event.allDay ? 'Today' : event.startLabel;
  const day = formatEventDate(event.date, 'long', 'long');
  return event.allDay ? day : `${day} · ${event.startLabel}`;
}

export function CalendarAgendaSecondary({ slot, calendar }: Readonly<{ slot: CommandCenterSlot; calendar: CalendarData | undefined }>): ReactNode {
  if (slot.render.type !== 'calendar-agenda') return null;
  const agenda = slot.render.eventIds
    .map((id) => calendar?.events.find((event) => event.id === id))
    .filter((event): event is CalendarData['events'][number] => event !== undefined);
  if (!agenda.length) return null;
  return <div className="command-calendar-agenda mt-4">
    {agenda.map((event) => <div key={event.id} className="command-calendar-agenda-item">
      <time dateTime={event.start}>{formatEventDay(event)}</time><span>{event.title}</span>
    </div>)}
  </div>;
}
