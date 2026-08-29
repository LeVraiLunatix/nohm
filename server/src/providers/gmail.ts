import { google } from 'googleapis';
import { gmailSchema, type GmailData } from '@nohm/shared';
import { readGmailToken, writeGmailToken } from '../gmailToken.js';
import type { Provider } from '../scheduler.js';

const THREAD_COUNT = 20;

/** "Some Name <a@b.c>" → "Some Name"; bare addresses pass through. */
function fromDisplay(raw: string): string {
  const addressStart = raw.indexOf('<');
  const display = (addressStart === -1 ? raw : raw.slice(0, addressStart)).trim();
  return display.replaceAll('"', '') || raw;
}

function headerValue(
  message: { payload?: { headers?: { name?: string | null; value?: string | null }[] } } | undefined,
  name: string,
): string {
  return message?.payload?.headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export function createGmailProvider(
  oauth: { clientId: string; clientSecret: string } | undefined,
): Provider<GmailData> {
  return {
    id: 'gmail',
    schema: gmailSchema,
    refreshMs: 5 * 60_000,
    timeoutMs: 20_000,
    isConfigured: () => oauth !== undefined && readGmailToken() !== undefined,
    async fetch(signal) {
      const token = readGmailToken();
      if (!oauth || !token) throw new Error('gmail is not configured');

      const auth = new google.auth.OAuth2(oauth.clientId, oauth.clientSecret);
      auth.setCredentials(token);
      // Google rotates access tokens on refresh — persist so restarts reuse them.
      auth.on('tokens', (fresh) => writeGmailToken({ ...readGmailToken(), ...fresh }));
      const gmail = google.gmail({ version: 'v1', auth });

      // gmail.metadata scope forbids `q` — list by label and use label counters.
      // INBOX + CATEGORY_PERSONAL (ANDed) mirrors the Gmail app's Primary tab: promotions,
      // social, updates and forums are other CATEGORY_* labels, and spam isn't in INBOX.
      const [personalLabel, threadList] = await Promise.all([
        gmail.users.labels.get({ userId: 'me', id: 'CATEGORY_PERSONAL' }, { signal }),
        gmail.users.threads.list(
          { userId: 'me', labelIds: ['INBOX', 'CATEGORY_PERSONAL'], maxResults: THREAD_COUNT },
          { signal },
        ),
      ]);

      const threads = await Promise.all(
        (threadList.data.threads ?? []).map((thread) =>
          gmail.users.threads.get(
            {
              userId: 'me',
              id: thread.id!,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date'],
            },
            { signal },
          ),
        ),
      );

      return {
        // Closest available counter to "unread in Primary" — it also counts archived unread
        // personal threads, but a Primary-scoped counter would need `q`, which our scope forbids.
        unreadThreads: personalLabel.data.threadsUnread ?? 0,
        threads: threads.map(({ data }) => {
          const messages = data.messages ?? [];
          const last = messages[messages.length - 1];
          return {
            id: data.id ?? '',
            from: fromDisplay(headerValue(last, 'From')) || '(unknown sender)',
            subject: headerValue(last, 'Subject') || '(no subject)',
            date: last?.internalDate
              ? new Date(Number(last.internalDate)).toISOString()
              : new Date(0).toISOString(),
            unread: messages.some((message) => message.labelIds?.includes('UNREAD')),
            url: `https://mail.google.com/mail/u/0/#inbox/${data.id}`,
          };
        }),
      };
    },
  };
}
