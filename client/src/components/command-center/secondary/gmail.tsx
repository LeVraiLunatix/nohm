import type { ReactNode } from 'react';
import type { CommandCenterSlot, GmailData } from '@nohm/shared';

/** `"Jane Doe" <jane@example.com>` → `Jane Doe`, falling back to the bare address. */
function senderName(from: string): string {
  const addressStart = from.indexOf('<');
  const visibleName = addressStart === -1 ? from : from.slice(0, addressStart);
  const name = visibleName.replaceAll('"', '').trim();
  return name || from.replace(/[<>]/g, '').trim();
}

export function GmailThreadList({
  threadIds,
  gmail,
  className = 'command-agenda-list mt-4',
}: Readonly<{ threadIds: string[]; gmail: GmailData | undefined; className?: string }>): ReactNode {
  const threads = threadIds
    .map((id) => gmail?.threads.find((thread) => thread.id === id))
    .filter((thread): thread is GmailData['threads'][number] => thread !== undefined);
  if (!threads.length) return null;
  return <div className={className}>
    {threads.map((thread) => <div key={thread.id} className="command-agenda-item">
      <span className="command-agenda-lead">{senderName(thread.from)}</span><span>{thread.subject}</span>
    </div>)}
  </div>;
}

export function GmailThreadsSecondary({ slot, gmail }: Readonly<{ slot: CommandCenterSlot; gmail: GmailData | undefined }>): ReactNode {
  if (slot.render.type !== 'gmail-threads') return null;
  const list = GmailThreadList({ threadIds: slot.render.threadIds, gmail, className: 'command-agenda-list mt-3' });
  if (!list) return null;
  return <>
    <p className="mt-4 text-sm font-semibold text-ink">{slot.title}</p>
    {list}
  </>;
}
