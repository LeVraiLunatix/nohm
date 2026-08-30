import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const serviceSettingsSchemas = {
  weather: z.object({ WEATHER_LAT: z.string().trim().min(1), WEATHER_LON: z.string().trim().min(1) }),
  calendar: z.object({ ICLOUD_USERNAME: z.string().trim().email(), ICLOUD_APP_PASSWORD: z.string().min(1) }),
  gmail: z.object({ GOOGLE_CLIENT_ID: z.string().trim().min(1), GOOGLE_CLIENT_SECRET: z.string().min(1) }),
  github: z
    .object({
      // The device-flow "Se connecter avec GitHub" button needs only this (a public value, not a
      // secret); it fills in the username and token itself. Manual PAT users still provide the
      // pair directly, so every field is optional and the provider decides if it has enough.
      GITHUB_OAUTH_CLIENT_ID: z.string().trim().min(1).optional(),
      GITHUB_USERNAME: z.string().trim().min(1).optional(),
      GITHUB_TOKEN: z.string().min(1).optional(),
      GITHUB_ISSUES_TOKEN: z.string().optional(),
    })
    .refine((v) => v.GITHUB_OAUTH_CLIENT_ID || (v.GITHUB_USERNAME && v.GITHUB_TOKEN), {
      message: 'provide the OAuth client id, or a username + token pair',
    }),
  // "Se connecter avec Steam" (OpenID) fills STEAM_ID, so it can arrive separately from the
  // one Web API key. The provider still needs both before it activates.
  steam: z
    .object({ STEAM_ID: z.string().regex(/^\d{17}$/).optional(), STEAM_API_KEY: z.string().min(1).optional() })
    .refine((v) => v.STEAM_ID || v.STEAM_API_KEY, { message: 'provide a SteamID or an API key' }),
  cider: z.object({ CIDER_RPC_URL: z.string().url(), CIDER_RPC_TOKEN: z.string().optional(), CIDER_RPC_UNAUTHENTICATED: z.enum(['0', '1']).optional() }),
  spotify: z.object({ SPOTIFY_CLIENT_ID: z.string().trim().min(1), SPOTIFY_CLIENT_SECRET: z.string().min(1) }),
  lastfm: z.object({ LASTFM_USER: z.string().trim().min(1), LASTFM_API_KEY: z.string().min(1) }),
  valorant: z.object({ RIOT_ID: z.string().regex(/^.+#.+$/), RIOT_REGION: z.string().trim().min(1), HENRIKDEV_API_KEY: z.string().min(1) }),
  clashRoyale: z.object({ CLASH_ROYALE_ID: z.string().trim().min(1), CLASH_ROYALE_API_KEY: z.string().min(1) }),
  clashOfClans: z.object({ CLASH_OF_CLANS_ID: z.string().trim().min(1), CLASH_OF_CLANS_API_KEY: z.string().min(1) }),
  roblox: z.object({ ROBLOX_ID: z.string().trim().min(1), ROBLOSECURITY: z.string().optional() }),
} as const;

export type ConfigurableServiceId = keyof typeof serviceSettingsSchemas;
export type StoredServiceSettings = Partial<Record<ConfigurableServiceId, Record<string, string>>>;

export interface SecretCodec {
  protect(plainText: string): Promise<string>;
  unprotect(protectedText: string): Promise<string>;
}

function runPowerShell(script: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(`DPAPI failed (${code}): ${stderr.trim()}`)));
    child.stdin.end(input, 'utf8');
  });
}

/** Windows DPAPI binds the encrypted blob to the currently signed-in Windows account. */
export class WindowsDpapiCodec implements SecretCodec {
  async protect(plainText: string): Promise<string> {
    return runPowerShell(
      "$value=[Console]::In.ReadToEnd();$bytes=[Text.Encoding]::UTF8.GetBytes($value);$protected=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Convert]::ToBase64String($protected)",
      plainText,
    );
  }

  async unprotect(protectedText: string): Promise<string> {
    return runPowerShell(
      "$value=[Console]::In.ReadToEnd();$bytes=[Convert]::FromBase64String($value);$plain=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Text.Encoding]::UTF8.GetString($plain)",
      protectedText,
    );
  }
}

/** DPAPI first; AES-256-GCM with a private local key when Windows denies DPAPI to an isolated process. */
export class LocalProtectedCodec implements SecretCodec {
  private readonly dpapi = new WindowsDpapiCodec();

  constructor(private readonly keyPath: string) {}

  private async key(): Promise<Buffer> {
    try {
      const key = await readFile(this.keyPath);
      if (key.length === 32) return key;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const key = randomBytes(32);
    await mkdir(path.dirname(this.keyPath), { recursive: true, mode: 0o700 });
    await writeFile(this.keyPath, key, { mode: 0o600 });
    return key;
  }

  async protect(plainText: string): Promise<string> {
    if (process.platform === 'win32') {
      try { return `dpapi:${await this.dpapi.protect(plainText)}`; } catch { /* isolated Windows context: use authenticated local encryption */ }
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', await this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return `aesgcm:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')}`;
  }

  async unprotect(protectedText: string): Promise<string> {
    if (protectedText.startsWith('dpapi:')) return this.dpapi.unprotect(protectedText.slice(6));
    if (!protectedText.startsWith('aesgcm:')) throw new Error('unknown secret protection scheme');
    const payload = Buffer.from(protectedText.slice(7), 'base64');
    const decipher = createDecipheriv('aes-256-gcm', await this.key(), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
  }
}

interface SettingsEnvelope { version: 1; protectedData: string }

export class ServiceSettingsStore {
  private settings: StoredServiceSettings = {};
  private readonly codec: SecretCodec;

  constructor(private readonly filePath: string, codec?: SecretCodec) {
    this.codec = codec ?? new LocalProtectedCodec(`${filePath}.key`);
  }

  async load(): Promise<StoredServiceSettings> {
    try {
      const envelope = JSON.parse(await readFile(this.filePath, 'utf8')) as SettingsEnvelope;
      if (envelope.version !== 1 || typeof envelope.protectedData !== 'string') return {};
      this.settings = JSON.parse(await this.codec.unprotect(envelope.protectedData)) as StoredServiceSettings;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') console.warn('[settings] Impossible de lire les connexions protégées.');
      this.settings = {};
    }
    return this.settings;
  }

  configuredIds(): ConfigurableServiceId[] {
    return Object.keys(this.settings) as ConfigurableServiceId[];
  }

  /** The stored fields for one service, so a caller can merge a partial update onto them
      before re-validating — e.g. changing a Riot ID without re-sending the API key. */
  get(id: ConfigurableServiceId): Record<string, string> {
    return { ...(this.settings[id] ?? {}) };
  }

  async set(id: ConfigurableServiceId, values: Record<string, string>): Promise<void> {
    this.settings = { ...this.settings, [id]: values };
    const protectedData = await this.codec.protect(JSON.stringify(this.settings));
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await writeFile(this.filePath, JSON.stringify({ version: 1, protectedData } satisfies SettingsEnvelope), { encoding: 'utf8', mode: 0o600 });
  }
}

export function isConfigurableServiceId(value: string): value is ConfigurableServiceId {
  return Object.hasOwn(serviceSettingsSchemas, value);
}

export function applyServiceSettingsToEnvironment(settings: StoredServiceSettings): void {
  for (const values of Object.values(settings)) {
    for (const [key, value] of Object.entries(values ?? {})) process.env[key] = value;
  }
}
