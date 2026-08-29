import type { WidgetStatus } from '@nohm/shared';

import type { Candidate } from '../types.js';

interface FallbackCopy {
  title: string;
  detail: string;
}

/**
 * Fallback candidates only fill a shape when the real source produced nothing — which can mean
 * "hasn't loaded yet" but can also mean "not configured" or "last fetch failed". Picking copy off
 * the source's own envelope status keeps a permanently-disabled widget from claiming forever that
 * a snapshot is still on its way.
 */
function fallbackCopy(status: WidgetStatus, loading: FallbackCopy, emptyWhenReady: FallbackCopy): FallbackCopy {
  if (status === 'disabled') return { title: 'Not configured', detail: 'See the README to set this widget up.' };
  if (status === 'error') return { title: "Couldn't load", detail: 'The last fetch failed — check the server logs.' };
  if (status === 'loading') return loading;
  return emptyWhenReady;
}

export function fallbackCandidates(status: {
  calendar: WidgetStatus;
}): Candidate[] {
  const horizon = fallbackCopy(
    status.calendar,
    { title: 'Building your command center', detail: 'Waiting for the first ranked snapshot.' },
    { title: 'Nothing urgent right now', detail: 'Your command center will adapt as new signals arrive.' },
  );
  return [
    { id: 'fallback:horizon', source: 'calendar', kind: 'fallback', score: 1, shapes: ['hero'], kicker: 'Open horizon', title: horizon.title, detail: horizon.detail, href: '#/personal', render: { type: 'text' } },
  ];
}
