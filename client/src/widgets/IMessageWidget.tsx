import type { IMessageData } from '@nohm/shared';
import { useWidget } from '../useWidget';
import { WidgetCard } from '../components/WidgetCard';
import { relativeTime } from '../lib/time';

export function IMessageWidget() {
  const { envelope, offline } = useWidget<IMessageData>('imessage');

  return (
    <WidgetCard title="Messages" envelope={envelope} offline={offline}>
      {(data) =>
        data.conversations.length === 0 ? (
          <p className="text-sm text-ink-faint">No conversations.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {data.conversations.map((conversation) => (
              <li key={conversation.id}>
                <span className="flex items-baseline gap-2">
                  <span
                    className={`truncate ${conversation.unreadCount > 0 ? 'font-semibold' : 'text-ink-muted'}`}
                  >
                    {conversation.label}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-ink-faint">
                    {relativeTime(conversation.timestamp)}
                  </span>
                </span>
                <span
                  className={`block truncate text-xs ${
                    conversation.unreadCount > 0 ? 'text-ink' : 'text-ink-faint'
                  }`}
                >
                  {conversation.isFromMe ? 'You: ' : ''}
                  {conversation.lastMessage}
                </span>
              </li>
            ))}
          </ul>
        )
      }
    </WidgetCard>
  );
}
