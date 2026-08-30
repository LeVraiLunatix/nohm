import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tokensDir } from './paths.js';

export interface HueToken {
  access_token: string;
  refresh_token: string;
  /** Epoch ms at which access_token expires. */
  expires_at: number;
  /** Bridge allowlist username, provisioned remotely during setup. */
  username: string;
}

const tokenDir = tokensDir;
const tokenPath = path.join(tokenDir, 'hue.json');

export function readHueToken(): HueToken | undefined {
  if (!existsSync(tokenPath)) return undefined;
  try {
    return JSON.parse(readFileSync(tokenPath, 'utf8')) as HueToken;
  } catch {
    return undefined;
  }
}

/** Owner-only permissions; the mode flags are no-ops on Windows. */
export function writeHueToken(token: HueToken): void {
  mkdirSync(tokenDir, { recursive: true, mode: 0o700 });
  writeFileSync(tokenPath, JSON.stringify(token, null, 2), { mode: 0o600 });
}
