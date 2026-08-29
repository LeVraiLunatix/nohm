import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { HealthIngest } from '@nohm/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIngestApp, tokenMatches, type HealthIngestSink } from './ingestApp.js';

const TOKEN = 'test-token-that-is-long-enough';
const WEBHOOK_SECRET = 'webhook-secret-long-enough-1234';

class RecordingSink implements HealthIngestSink {
  readonly received: { sample: HealthIngest; today: string }[] = [];
  async ingest(sample: HealthIngest, today: string) {
    this.received.push({ sample, today });
    return undefined;
  }
}

let running: Server | undefined;

async function listen(app: ReturnType<typeof createIngestApp>): Promise<string> {
  running = await new Promise<Server>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  return `http://127.0.0.1:${(running.address() as AddressInfo).port}`;
}

async function start(
  sink: HealthIngestSink,
  onIngested?: (dayCount: number) => Promise<void>,
): Promise<string> {
  return listen(createIngestApp({ store: sink, timezone: 'Europe/Oslo', token: TOKEN, onIngested }));
}

function postWebhook(baseUrl: string, event: string, payload: unknown, secret = WEBHOOK_SECRET) {
  const body = JSON.stringify(payload);
  return fetch(`${baseUrl}/api/github/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-event': event,
      'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
    },
    body,
  });
}

// `null` means "send no Authorization header" — `undefined` would fall back to the default token.
function post(baseUrl: string, body: unknown, token: string | null = TOKEN) {
  return fetch(`${baseUrl}/api/health/ingest`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

afterEach(async () => {
  if (!running) return;
  const server = running;
  running = undefined;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('tokenMatches', () => {
  it('accepts the exact token and rejects near-misses', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(`${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokenMatches(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(tokenMatches('', TOKEN)).toBe(false);
    expect(tokenMatches(undefined, TOKEN)).toBe(false);
  });
});

describe('createIngestApp', () => {
  it('stores a single-day sample', async () => {
    const sink = new RecordingSink();
    const baseUrl = await start(sink);

    const response = await post(baseUrl, { watchSteps: 8_231, exerciseMinutes: 42 });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, days: 1 });
    expect(sink.received).toHaveLength(1);
    expect(sink.received[0]?.sample).toMatchObject({ watchSteps: 8_231, exerciseMinutes: 42 });
  });

  it('stores every day of a rolling window, so a machine that was off backfills the gap', async () => {
    const sink = new RecordingSink();
    const baseUrl = await start(sink);

    const response = await post(baseUrl, {
      days: [
        { date: '2026-08-09', watchSteps: 4_000 },
        { date: '2026-08-10', watchSteps: 12_500 },
        { date: '2026-08-11', watchSteps: 900 },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, days: 3 });
    expect(sink.received.map((entry) => entry.sample.date)).toEqual([
      '2026-08-09',
      '2026-08-10',
      '2026-08-11',
    ]);
  });

  it('rejects a request with a wrong or missing token before touching the store', async () => {
    const sink = new RecordingSink();
    const baseUrl = await start(sink);

    const wrong = await post(baseUrl, { watchSteps: 1 }, 'not-the-token-but-long-enough');
    const missing = await post(baseUrl, { watchSteps: 1 }, null);

    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(sink.received).toEqual([]);
  });

  it('rejects a body that matches neither wire shape', async () => {
    const sink = new RecordingSink();
    const baseUrl = await start(sink);

    const response = await post(baseUrl, { watchSteps: 'lots' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid-health-sample' });
    expect(sink.received).toEqual([]);
  });

  it('answers malformed JSON in JSON rather than the default HTML error page', async () => {
    const sink = new RecordingSink();
    const baseUrl = await start(sink);

    const response = await post(baseUrl, '{"watchSteps":');

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid-request' });
  });

  it('reports a store failure as a category, without the underlying error reaching the client', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const baseUrl = await start({
      ingest: () => Promise.reject(new Error('connection to postgres://user:secret@host failed')),
    });

    const response = await post(baseUrl, { watchSteps: 8_231 });

    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: 'ingest-failed' });
    expect(body).not.toContain('secret');
    consoleError.mockRestore();
  });

  it('announces the write once per request, not once per day', async () => {
    const announced: number[] = [];
    const baseUrl = await start(new RecordingSink(), async (dayCount) => {
      announced.push(dayCount);
    });

    await post(baseUrl, {
      days: [
        { date: '2026-08-09', watchSteps: 1 },
        { date: '2026-08-10', watchSteps: 2 },
      ],
    });

    expect(announced).toEqual([2]);
  });

  it('does not announce a request that stored nothing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const announced: number[] = [];
    const record = async (dayCount: number) => {
      announced.push(dayCount);
    };

    const rejecting = await start({ ingest: () => Promise.reject(new Error('nope')) }, record);
    await post(rejecting, { watchSteps: 1 });
    expect(announced).toEqual([]);
    consoleError.mockRestore();
  });

  it('does not announce a rejected or malformed request', async () => {
    const announced: number[] = [];
    const baseUrl = await start(new RecordingSink(), async (dayCount) => {
      announced.push(dayCount);
    });

    await post(baseUrl, { watchSteps: 1 }, null);
    await post(baseUrl, { watchSteps: 'lots' });

    expect(announced).toEqual([]);
  });

  it('accepts a correctly signed GitHub event and hands it on', async () => {
    const seen: { event: string; payload: unknown }[] = [];
    const app = createIngestApp({
      store: new RecordingSink(),
      timezone: 'Europe/Oslo',
      token: TOKEN,
      githubWebhookSecret: WEBHOOK_SECRET,
      onGithubEvent: async (event, payload) => {
        seen.push({ event, payload });
      },
    });
    const baseUrl = await listen(app);

    const response = await postWebhook(baseUrl, 'push', { ref: 'refs/heads/main' });

    expect(response.status).toBe(200);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({ event: 'push', payload: { ref: 'refs/heads/main' } });
  });

  it('rejects a GitHub event whose signature does not match', async () => {
    const seen: string[] = [];
    const app = createIngestApp({
      store: new RecordingSink(),
      timezone: 'Europe/Oslo',
      token: TOKEN,
      githubWebhookSecret: WEBHOOK_SECRET,
      onGithubEvent: async (event) => {
        seen.push(event);
      },
    });
    const baseUrl = await listen(app);

    const response = await postWebhook(baseUrl, 'push', { ref: 'refs/heads/main' }, 'wrong-secret');

    expect(response.status).toBe(401);
    expect(seen).toEqual([]);
  });

  it('acknowledges CI chatter without acting on it, so redeliveries are not queued', async () => {
    const seen: string[] = [];
    const app = createIngestApp({
      store: new RecordingSink(),
      timezone: 'Europe/Oslo',
      token: TOKEN,
      githubWebhookSecret: WEBHOOK_SECRET,
      onGithubEvent: async (event) => {
        seen.push(event);
      },
    });
    const baseUrl = await listen(app);

    const response = await postWebhook(baseUrl, 'check_run', { action: 'completed' });

    expect(response.status).toBe(200);
    expect(seen).toEqual([]);
  });

  it('leaves the webhook route unmounted when no secret is configured', async () => {
    const baseUrl = await start(new RecordingSink());

    const response = await postWebhook(baseUrl, 'push', { ref: 'refs/heads/main' });

    expect(response.status).toBe(404);
  });

  it('serves an unauthenticated liveness probe for the platform healthcheck', async () => {
    const baseUrl = await start(new RecordingSink());

    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
