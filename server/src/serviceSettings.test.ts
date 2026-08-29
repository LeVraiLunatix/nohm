import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalProtectedCodec, ServiceSettingsStore, applyServiceSettingsToEnvironment, type SecretCodec } from './serviceSettings.js';

const codec: SecretCodec = {
  protect: async (value) => Buffer.from(value).toString('base64'),
  unprotect: async (value) => Buffer.from(value, 'base64').toString('utf8'),
};
let temp = '';
afterEach(async () => { if (temp) await rm(temp, { recursive: true, force: true }); });

describe('ServiceSettingsStore', () => {
  it('persists service values without exposing them through the status list', async () => {
    temp = await mkdtemp(path.join(os.tmpdir(), 'nohm-settings-'));
    const file = path.join(temp, 'services.json');
    const store = new ServiceSettingsStore(file, codec);
    await store.set('lastfm', { LASTFM_USER: 'listener', LASTFM_API_KEY: 'secret' });
    expect(store.configuredIds()).toEqual(['lastfm']);
    const reloaded = new ServiceSettingsStore(file, codec);
    expect(await reloaded.load()).toEqual({ lastfm: { LASTFM_USER: 'listener', LASTFM_API_KEY: 'secret' } });
  });

  it('applies stored settings before environment parsing', () => {
    applyServiceSettingsToEnvironment({ weather: { WEATHER_LAT: '48.85', WEATHER_LON: '2.35' } });
    expect(process.env.WEATHER_LAT).toBe('48.85');
  });

  it('round-trips authenticated local encryption without plaintext in the payload', async () => {
    temp = await mkdtemp(path.join(os.tmpdir(), 'nohm-codec-'));
    const protectedCodec = new LocalProtectedCodec(path.join(temp, 'settings.key'));
    const encrypted = await protectedCodec.protect('very-secret-value');
    expect(encrypted).not.toContain('very-secret-value');
    expect(await protectedCodec.unprotect(encrypted)).toBe('very-secret-value');
  });
});
