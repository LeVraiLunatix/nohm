import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tokensDir } from './paths.js';

export interface GmailToken {
  refresh_token?: string | null;
  access_token?: string | null;
  expiry_date?: number | null;
  [key: string]: unknown;
}

const tokenDir = tokensDir;
const tokenPath = path.join(tokenDir, 'gmail.json');

export function readGmailToken(): GmailToken | undefined {
  if (!existsSync(tokenPath)) return undefined;
  try {
    return JSON.parse(readFileSync(tokenPath, 'utf8')) as GmailToken;
  } catch {
    return undefined;
  }
}

/** Owner-only permissions; the mode flags are no-ops on Windows. */
export function writeGmailToken(token: object): void {
  mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
  writeFileSync(tokenPath, JSON.stringify(token, null, 2), { mode: 0o600 });
}
