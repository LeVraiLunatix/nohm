import { accessSync, constants, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { iMessageDataSchema, type IMessageConversation, type IMessageData } from '@nohm/shared';
import type { Provider } from '../scheduler.js';

const dbPath = path.join(os.homedir(), 'Library', 'Messages', 'chat.db');
const addressBookPath = path.join(os.homedir(), 'Library', 'Application Support', 'AddressBook');

// Apple's message.date is nanoseconds since 2001-01-01T00:00:00Z (the "Core Data" epoch).
const APPLE_EPOCH_MS = 978307200000;
const SNIPPET_MAX_LENGTH = 120;

/**
 * One preview message per chat, as returned by the query in fetch(). For chats with unread
 * incoming messages, the preview is the newest unread incoming message; otherwise it is the
 * newest message. With `readBigInts: true` every integer column comes back as a bigint.
 */
export interface RawIMessageRow {
  chatId: bigint;
  displayName: string | null;
  chatIdentifier: string;
  text: string | null;
  attributedBody: Uint8Array | null;
  isFromMe: bigint;
  dateNs: bigint;
  unreadCount: bigint;
}

export interface RawContactRow {
  handle: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  nickname: string | null;
  organization: string | null;
  name: string | null;
}

export type ContactResolver = (handle: string) => string | undefined;

const NSString = Buffer.from('NSString');
const OBJECT_REPLACEMENT_CHARACTER = /\uFFFC/g;
const CONTACT_CACHE_MS = 5 * 60_000;

function decodeTypedStreamLength(body: Uint8Array, offset: number): { length: number; start: number } | null {
  const first = body[offset];
  if (first === undefined) return null;
  if (first !== 0x81) return { length: first, start: offset + 1 };
  if (offset + 2 >= body.length) return null;
  return {
    length: body[offset + 1] | (body[offset + 2] << 8),
    start: offset + 3,
  };
}

/** Extract the NSString payload from Apple's NSAttributedString typedstream archive. */
export function decodeAttributedBody(body: Uint8Array | null): string | null {
  if (!body) return null;
  const bytes = Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  let markerIndex = bytes.indexOf(NSString);
  while (markerIndex !== -1) {
    const header = markerIndex + NSString.length;
    // NSString payloads in Messages are preceded by: 01, object ref, 84, 01, 2b.
    if (
      bytes[header] === 0x01
      && bytes[header + 2] === 0x84
      && bytes[header + 3] === 0x01
      && bytes[header + 4] === 0x2b
    ) {
      const encodedLength = decodeTypedStreamLength(bytes, header + 5);
      if (encodedLength && encodedLength.start + encodedLength.length <= bytes.length) {
        try {
          return new TextDecoder('utf-8', { fatal: true }).decode(
            bytes.subarray(encodedLength.start, encodedLength.start + encodedLength.length),
          );
        } catch {
          // Keep scanning in case this was a class marker rather than the string payload.
        }
      }
    }
    markerIndex = bytes.indexOf(NSString, markerIndex + NSString.length);
  }
  return null;
}

function contactName(row: RawContactRow): string | undefined {
  const personalName = [row.firstName, row.middleName, row.lastName]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');
  return personalName || row.nickname?.trim() || row.organization?.trim() || row.name?.trim() || undefined;
}

/** 'exact' keys (same digits, or same email) can only collide across rows for the *same* real
 * contact — e.g. duplicated across synced Contacts sources with a slightly different name. 'fuzzy'
 * keys (last-8-digit suffix, for matching a country-prefixed Messages handle to a local number)
 * can legitimately collide across different people with different country codes, so a conflict
 * there stays ambiguous. */
function contactKeys(handle: string): { key: string; kind: 'exact' | 'fuzzy' }[] {
  const trimmed = handle.trim();
  if (!trimmed) return [];
  if (trimmed.includes('@')) return [{ key: `email:${trimmed.toLocaleLowerCase()}`, kind: 'exact' }];
  const digits = trimmed.replace(/\D/g, '').replace(/^00/, '');
  if (!digits) return [];
  const keys: { key: string; kind: 'exact' | 'fuzzy' }[] = [{ key: `phone:${digits}`, kind: 'exact' }];
  if (digits.length >= 8) keys.push({ key: `phone-suffix:${digits.slice(-8)}`, kind: 'fuzzy' });
  return keys;
}

/** Prefers whichever name has more name parts, then whichever is longer — e.g. "Ada Lovelace" over "Ada". */
function preferName(a: string, b: string): string {
  const partsA = a.split(' ').filter(Boolean).length;
  const partsB = b.split(' ').filter(Boolean).length;
  if (partsA !== partsB) return partsA > partsB ? a : b;
  return a.length >= b.length ? a : b;
}

export function createContactResolver(rows: RawContactRow[]): ContactResolver {
  const contacts = new Map<string, string | null>();
  for (const row of rows) {
    const name = contactName(row);
    if (!row.handle || !name) continue;
    for (const { key, kind } of contactKeys(row.handle)) {
      const existing = contacts.get(key);
      if (existing === undefined || existing === name) {
        contacts.set(key, name);
      } else if (kind === 'exact') {
        contacts.set(key, existing === null ? name : preferName(existing, name));
      } else {
        contacts.set(key, null);
      }
    }
  }
  return (handle) => {
    for (const { key } of contactKeys(handle)) {
      const name = contacts.get(key);
      if (name) return name;
    }
    return undefined;
  };
}

function findAddressBookDatabases(directory: string, depth = 0): string[] {
  if (depth > 4) return [];
  try {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findAddressBookDatabases(entryPath, depth + 1);
      return entry.isFile() && entry.name.endsWith('.abcddb') ? [entryPath] : [];
    });
  } catch {
    return [];
  }
}

function readContactRows(databasePath: string): RawContactRow[] {
  const db = new DatabaseSync(databasePath, { readOnly: true, timeout: 1_000 });
  const nameColumns = `
    r.ZFIRSTNAME AS firstName, r.ZMIDDLENAME AS middleName, r.ZLASTNAME AS lastName,
    r.ZNICKNAME AS nickname, r.ZORGANIZATION AS organization, r.ZNAME AS name
  `;
  try {
    const phones = db.prepare(`
      SELECT p.ZFULLNUMBER AS handle, ${nameColumns}
      FROM ZABCDPHONENUMBER p
      JOIN ZABCDRECORD r ON r.Z_PK = p.ZOWNER
      WHERE p.ZFULLNUMBER IS NOT NULL
    `).all() as unknown as RawContactRow[];
    const emails = db.prepare(`
      SELECT e.ZADDRESS AS handle, ${nameColumns}
      FROM ZABCDEMAILADDRESS e
      JOIN ZABCDRECORD r ON r.Z_PK = e.ZOWNER
      WHERE e.ZADDRESS IS NOT NULL
    `).all() as unknown as RawContactRow[];
    return [...phones, ...emails];
  } finally {
    db.close();
  }
}

function loadContactResolver(): ContactResolver {
  const rows = findAddressBookDatabases(addressBookPath).flatMap((databasePath) => {
    try {
      return readContactRows(databasePath);
    } catch {
      // Contacts sources can have different/older schemas; skip only the incompatible source.
      return [];
    }
  });
  return createContactResolver(rows);
}

function truncate(text: string): string {
  return text.length > SNIPPET_MAX_LENGTH ? `${text.slice(0, SNIPPET_MAX_LENGTH - 1)}…` : text;
}

/** Pure row → schema mapping, kept separate from DB I/O so it can be unit-tested against a fixture. */
export function mapRows(rows: RawIMessageRow[], resolveContact: ContactResolver = () => undefined): IMessageConversation[] {
  return rows.map((row) => {
    // Divide the bigint nanosecond timestamp down to milliseconds before converting to Number —
    // going through Number at nanosecond scale loses precision.
    const dateMs = APPLE_EPOCH_MS + Number(row.dateNs / 1_000_000n);
    const message = row.text ?? decodeAttributedBody(row.attributedBody);
    const preview = message?.replaceAll(OBJECT_REPLACEMENT_CHARACTER, '[attachment]').trim();
    return {
      id: row.chatId.toString(),
      label: row.displayName || resolveContact(row.chatIdentifier) || row.chatIdentifier,
      lastMessage: preview ? truncate(preview) : '[message]',
      isFromMe: row.isFromMe !== 0n,
      timestamp: new Date(dateMs).toISOString(),
      unreadCount: Number(row.unreadCount),
    };
  });
}

export const CONVERSATIONS_QUERY = `
  SELECT
    c.ROWID AS chatId,
    c.display_name AS displayName,
    c.chat_identifier AS chatIdentifier,
    m.text AS text,
    m.attributedBody AS attributedBody,
    m.is_from_me AS isFromMe,
    m.date AS dateNs,
    (
      SELECT COUNT(*) FROM message m2
      JOIN chat_message_join cmj2 ON cmj2.message_id = m2.ROWID
      WHERE cmj2.chat_id = c.ROWID AND m2.is_from_me = 0 AND m2.is_read = 0
    ) AS unreadCount
  FROM chat c
  JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID
  JOIN message m ON m.ROWID = cmj.message_id
  WHERE m.ROWID = COALESCE(
    (
      SELECT MAX(cmj3.message_id)
      FROM chat_message_join cmj3
      JOIN message m3 ON m3.ROWID = cmj3.message_id
      WHERE cmj3.chat_id = c.ROWID AND m3.is_from_me = 0 AND m3.is_read = 0
    ),
    (
      SELECT MAX(cmj3.message_id) FROM chat_message_join cmj3 WHERE cmj3.chat_id = c.ROWID
    )
  )
  ORDER BY m.date DESC
  LIMIT 15
`;

function isReadable(): boolean {
  try {
    accessSync(dbPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function createIMessageProvider(): Provider<IMessageData> {
  let resolveContact: ContactResolver = () => undefined;
  let contactsLoadedAt = 0;
  return {
    id: 'imessage',
    schema: iMessageDataSchema,
    refreshMs: 30_000,
    timeoutMs: 5_000,
    // False until Full Disk Access is granted — the widget then shows "not configured" rather
    // than a fetch error. Requires a server restart after granting access (checked once here,
    // at registration, not on every poll — see the scheduler's register()).
    isConfigured: () => process.platform === 'darwin' && isReadable(),
    async fetch(): Promise<IMessageData> {
      // node:sqlite is synchronous — the scheduler's AbortSignal can't interrupt a blocking
      // query, so this stays a small, indexed, LIMIT-bounded read instead of relying on cancellation.
      const db = new DatabaseSync(dbPath, { readOnly: true, readBigInts: true, timeout: 1_000 });
      try {
        if (Date.now() - contactsLoadedAt >= CONTACT_CACHE_MS) {
          resolveContact = loadContactResolver();
          contactsLoadedAt = Date.now();
        }
        const rows = db.prepare(CONVERSATIONS_QUERY).all() as unknown as RawIMessageRow[];
        return { conversations: mapRows(rows, resolveContact) };
      } finally {
        db.close();
      }
    },
  };
}
