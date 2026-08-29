import { ZodError, type ZodType } from 'zod';
import type { WidgetEnvelope, WidgetStatus, WidgetSummary } from '@nohm/shared';

export interface Provider<T = unknown> {
  id: string;
  /** Output is validated against this before caching; failures follow the error/stale rules. */
  schema: ZodType<T>;
  refreshMs: number;
  timeoutMs: number;
  /** false → status "disabled", never fetched (missing credentials/config). */
  isConfigured(): boolean;
  /** `force` is true for a user-initiated refresh — providers may use it to bypass self-imposed (but not externally-imposed) pacing. */
  fetch(signal: AbortSignal, force: boolean): Promise<T>;
  /** Last-good data shared between dashboard server instances, if this provider supports it. */
  loadCached?(): Promise<{ data: T; fetchedAt: Date } | undefined>;
  /** Optional adaptive schedule, selected after each completed refresh. `refreshMs` remains the
   * fallback delay and the client-visible cache polling cadence. */
  nextRefreshMs?(data: T | undefined): number;
}

interface Entry {
  provider: Provider;
  status: WidgetStatus;
  data?: unknown;
  fetchedAt?: Date;
  lastAttemptAt?: Date;
  error?: string;
  inFlight: boolean;
  refreshPromise?: Promise<void>;
  timer?: NodeJS.Timeout;
}

/** Map any failure to a safe category string — raw errors can leak tokens/URLs. */
function sanitizeError(err: unknown): string {
  if (err instanceof ZodError) return 'invalid-response';
  if (err instanceof Error && err.name === 'AbortError') return 'timeout';
  return 'fetch-failed';
}

export class ProviderScheduler {
  private readonly entries = new Map<string, Entry>();
  private readonly settledListeners = new Set<(id: string) => void>();
  private running = false;
  private gameMode = false;
  private readonly gameModeEssential = new Set(['music-cider', 'spotify', 'system']);

  setGameMode(active: boolean): void {
    this.gameMode = active;
  }

  register(provider: Provider): void {
    if (this.entries.has(provider.id)) {
      throw new Error(`Provider "${provider.id}" is already registered`);
    }
    this.entries.set(provider.id, {
      provider,
      status: provider.isConfigured() ? 'loading' : 'disabled',
      inFlight: false,
    });
  }

  /** Immediate fetch for every configured provider, then per-provider intervals. */
  start(): void {
    this.running = true;
    for (const entry of this.entries.values()) {
      if (entry.status === 'disabled') continue;
      void this.hydrateAndRefresh(entry);
      if (entry.provider.nextRefreshMs) continue;
      entry.timer = setInterval(
        () => void this.refresh(entry.provider.id, false, true),
        entry.provider.refreshMs,
      );
      entry.timer.unref?.();
    }
  }

  private async hydrateAndRefresh(entry: Entry): Promise<void> {
    try {
      const cached = await entry.provider.loadCached?.();
      if (cached) {
        entry.data = entry.provider.schema.parse(cached.data);
        entry.fetchedAt = cached.fetchedAt;
        entry.status = 'stale';
      }
    } catch (err) {
      console.error(`[${entry.provider.id}] cached data unavailable:`, err);
    }
    await this.refresh(entry.provider.id);
  }

  stop(): void {
    this.running = false;
    for (const entry of this.entries.values()) {
      if (entry.timer) clearInterval(entry.timer);
      entry.timer = undefined;
    }
  }

  /** Single-flight: a refresh while the previous one is running is a no-op. `force` is passed through for user-initiated refreshes. */
  refresh(id: string, force = false, scheduled = false): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry || entry.status === 'disabled') return Promise.resolve();
    if (scheduled && this.gameMode && !this.gameModeEssential.has(id)) return Promise.resolve();
    if (entry.inFlight) return entry.refreshPromise ?? Promise.resolve();

    entry.inFlight = true;
    entry.refreshPromise = (async () => {
      const controller = new AbortController();
      // A provider should honour this signal, but a database driver or third-party SDK may not.
      // Racing the fetch as well makes the scheduler recover even when the underlying operation
      // remains pending after abort, instead of leaving the widget in `loading` indefinitely.
      let timeout: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          const error = new Error('provider timed out');
          error.name = 'AbortError';
          reject(error);
        }, entry.provider.timeoutMs);
      });
      try {
        const raw = await Promise.race([
          entry.provider.fetch(controller.signal, force),
          timeoutPromise,
        ]);
        entry.data = entry.provider.schema.parse(raw);
        entry.fetchedAt = new Date();
        entry.status = 'ready';
        entry.error = undefined;
      } catch (err) {
        // Timeout surfaces as AbortError regardless of how the provider failed.
        const error = controller.signal.aborted
          ? 'timeout'
          : sanitizeError(err);
        entry.error = error;
        entry.status = entry.data !== undefined ? 'stale' : 'error';
        console.error(`[${id}] refresh failed (${error}):`, err);
      } finally {
        if (timeout) clearTimeout(timeout);
        entry.lastAttemptAt = new Date();
        entry.inFlight = false;
        entry.refreshPromise = undefined;
        this.scheduleNext(entry);
        for (const listener of this.settledListeners) listener(id);
      }
    })();

    return entry.refreshPromise;
  }

  private scheduleNext(entry: Entry): void {
    if (!this.running || !entry.provider.nextRefreshMs) return;
    if (entry.timer) clearTimeout(entry.timer);
    const delayMs = entry.provider.nextRefreshMs(entry.data);
    entry.timer = setTimeout(
      () => void this.refresh(entry.provider.id, false, true),
      Math.max(1_000, delayMs),
    );
    entry.timer.unref?.();
  }

  /** Notified after every refresh attempt (success or failure) for any provider. Used to let a
   * derived provider (the command center) recompute right away instead of waiting out its own
   * timer — otherwise it can snapshot an all-fallback ranking before slower siblings' first fetch
   * lands, and sit on that for a full refresh cycle. */
  onSettled(listener: (id: string) => void): void {
    this.settledListeners.add(listener);
  }

  getEnvelope(id: string): WidgetEnvelope | undefined {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    return {
      id,
      status: entry.status,
      data: entry.data,
      fetchedAt: entry.fetchedAt?.toISOString(),
      lastAttemptAt: entry.lastAttemptAt?.toISOString(),
      error: entry.error,
      refreshMs: entry.provider.refreshMs,
    };
  }

  /** Read-only snapshot for derived providers such as the command center. */
  getAllEnvelopes(): Record<string, WidgetEnvelope> {
    return Object.fromEntries(
      [...this.entries.keys()].map((id) => [id, this.getEnvelope(id)!]),
    );
  }

  list(): WidgetSummary[] {
    return [...this.entries.values()].map((entry) => ({
      id: entry.provider.id,
      status: entry.status,
      fetchedAt: entry.fetchedAt?.toISOString(),
      refreshMs: entry.provider.refreshMs,
    }));
  }
}
