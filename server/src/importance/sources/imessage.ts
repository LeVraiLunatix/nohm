import type { IMessageData } from '@nohm/shared';

import type { Candidate } from '../types.js';
import { allShapes } from './shapes.js';

export function imessageCandidates(data: IMessageData | undefined, freshMs: number): Candidate[] {
  const unread = data?.conversations.filter((conversation) => conversation.unreadCount > 0) ?? [];
  if (!unread.length) return [];
  const totalUnread = unread.reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  const latest = unread.reduce(
    (mostRecent, conversation) => (Date.parse(conversation.timestamp) > Date.parse(mostRecent.timestamp) ? conversation : mostRecent),
    unread[0]!,
  );
  const fresh = Date.now() - Date.parse(latest.timestamp) < freshMs;
  return [{
    id: 'imessage:unread', source: 'imessage', kind: 'imessage', score: fresh ? 76 : 40,
    shapes: fresh ? [...allShapes] : ['tile'], kicker: fresh ? 'New message' : 'Messages',
    title: `${totalUnread} unread`, detail: `${latest.label}: ${latest.lastMessage}`,
    href: '#/personal/imessage', render: { type: 'text' },
  }];
}
