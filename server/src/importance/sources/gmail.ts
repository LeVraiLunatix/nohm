import type { GmailData } from '@nohm/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

/**
 * Freshness/staleness are judged from the newest *unread* thread's own message date, not from
 * watching `unreadThreads` change across polls: that count alone can't tell "one arrived, one was
 * read" (net-zero, but genuinely new mail) apart from "nothing happened", and it can't tell
 * "count dropped because you read something" apart from "count rose because mail arrived" — both
 * looked identical as "the number changed" to an earlier version of this function. The Gmail API
 * returns threads newest-first, so the first unread entry in the list is the most recent one.
 * "Stale" means even that newest unread thread is old — a sign to stop nagging about it, not
 * promote it: most surviving unread mail (receipts, newsletters) was never going to be replied to.
 */
export function gmailCandidates(
  data: GmailData | undefined,
  freshThresholdMs: number,
  staleThresholdMs: number,
  now = Date.now(),
): Candidate[] {
  if (!data) return [];
  const newestUnread = data.threads.find((thread) => thread.unread);
  const hasUnread = data.unreadThreads > 0;
  const newestUnreadAgeMs = newestUnread ? now - Date.parse(newestUnread.date) : undefined;
  const fresh = hasUnread && newestUnreadAgeMs !== undefined && newestUnreadAgeMs < freshThresholdMs;
  const stale = hasUnread && newestUnreadAgeMs !== undefined && newestUnreadAgeMs >= staleThresholdMs;
  if (stale) return [];
  let score = hasUnread ? 53 : 20;
  let kicker = 'Inbox';
  const detail = newestUnread?.subject ?? 'No unread thread needs attention';
  let shapes: Candidate['shapes'] = ['tile'];
  if (fresh) {
    score = 78;
    kicker = 'New mail';
    shapes = [...allShapes];
  }
  const unreadIds = data.threads.filter((thread) => thread.unread).slice(0, 3).map((thread) => thread.id);
  return [{
    id: 'gmail:inbox', source: 'gmail', kind: 'gmail', score,
    shapes, kicker, title: `${data.unreadThreads} unread`, detail,
    href: '#/personal/gmail',
    render: unreadIds.length ? { type: 'gmail-threads', threadIds: unreadIds } : { type: 'text' },
  }];
}
