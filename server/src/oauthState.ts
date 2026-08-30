import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * OAuth `state` as a signed token instead of a server-memory Map entry. The previous Map broke
 * whenever `/start` and `/callback` hit different processes (a dev + a prod instance, or the same
 * one across a restart), which surfaced as "la demande a expiré ou a été annulée". An HMAC over
 * `{service, expiry}` lets any instance sharing the key file validate it.
 */

const DEFAULT_TTL_MS = 10 * 60_000;

let cachedKey: Buffer | undefined;

function stateKey(dataDir: string): Buffer {
  if (cachedKey) return cachedKey;
  const file = path.join(dataDir, 'oauth-state.key');
  if (existsSync(file)) {
    const existing = readFileSync(file);
    if (existing.length === 32) return (cachedKey = existing);
  }
  const fresh = randomBytes(32);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  writeFileSync(file, fresh, { mode: 0o600 });
  return (cachedKey = fresh);
}

export function signOAuthState(dataDir: string, service: string, ttlMs = DEFAULT_TTL_MS): string {
  const payload = Buffer.from(JSON.stringify({ s: service, e: Date.now() + ttlMs })).toString('base64url');
  const sig = createHmac('sha256', stateKey(dataDir)).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyOAuthState(dataDir: string, token: string, service: string): boolean {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = createHmac('sha256', stateKey(dataDir)).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { s?: unknown; e?: unknown };
    return parsed.s === service && typeof parsed.e === 'number' && parsed.e > Date.now();
  } catch {
    return false;
  }
}
