import { describe, expect, it } from 'vitest';
import type { AiUsageToolData } from '@nohm/shared';
import { aiCandidates } from './ai.js';

describe('aiCandidates', () => {
  it('identifies the tightest tool and limit window in the runway detail', () => {
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 80, resetsAt: '2026-07-16T21:59:00.000Z' },
      weekly: { usedPercent: 50, resetsAt: '2026-07-20T21:59:00.000Z' },
      history: [],
    };

    const runway = aiCandidates([{ id: 'codex', label: 'Codex', data }], 7, 50)
      .find((candidate) => candidate.id === 'ai-usage:runway');

    expect(runway).toMatchObject({ title: '20% available', accent: 'codex' });
    expect(runway?.detail).toContain('Codex · 5-hour limit');
  });

  it('does not flag heavy usage from a few hours of same-day samples right after a window reset', () => {
    // All samples land on the same UTC day as "now" and are excluded as the partial, still-forming
    // bucket — mirroring githubCandidates' own trailing window — so there's no prior-day baseline yet.
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 70, resetsAt: '2026-07-20T18:00:00.000Z' },
      history: [
        { at: '2026-07-20T10:00:00.000Z', fiveHourUsedPercent: 0 },
        { at: '2026-07-20T10:15:00.000Z', fiveHourUsedPercent: 1 },
        { at: '2026-07-20T10:30:00.000Z', fiveHourUsedPercent: 2 },
        { at: '2026-07-20T13:00:00.000Z', fiveHourUsedPercent: 70 },
      ],
    };

    const anomaly = aiCandidates([{ id: 'claude', label: 'Claude', data }], 14, 50)
      .find((candidate) => candidate.id === 'ai-usage:anomaly:claude');

    expect(anomaly).toBeUndefined();
  });

  it('flags heavy usage against a trailing daily-average baseline, not a raw sample-count slice', () => {
    const priorDay = (date: string, percent: number): AiUsageToolData['history'][number] => (
      { at: `${date}T12:00:00.000Z`, fiveHourUsedPercent: percent }
    );
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 90, resetsAt: '2026-07-20T18:00:00.000Z' },
      history: [
        priorDay('2026-07-15', 10),
        priorDay('2026-07-16', 12),
        priorDay('2026-07-17', 8),
        priorDay('2026-07-18', 11),
        { at: '2026-07-20T09:00:00.000Z', fiveHourUsedPercent: 90 },
      ],
    };

    const anomaly = aiCandidates([{ id: 'claude', label: 'Claude', data }], 14, 50)
      .find((candidate) => candidate.id === 'ai-usage:anomaly:claude');

    expect(anomaly).toMatchObject({ kicker: 'Heavy usage', title: 'Claude running well above usual' });
  });

  it('treats a five-hour allowance that resets before its recorded deadline as a command-center event', () => {
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 8, resetsAt: '2026-07-20T18:30:00.000Z' },
      history: [
        {
          at: '2026-07-20T10:00:00.000Z', fiveHourUsedPercent: 82,
          fiveHourResetsAt: '2026-07-20T15:00:00.000Z',
        },
        {
          at: '2026-07-20T10:15:00.000Z', fiveHourUsedPercent: 8,
          fiveHourResetsAt: '2026-07-20T18:30:00.000Z',
        },
      ],
    };

    const reset = aiCandidates([{ id: 'codex', label: 'Codex', data }], 7, 50)
      .find((candidate) => candidate.id === 'ai-usage:five-hour-reset:codex');

    expect(reset).toMatchObject({
      kicker: 'Fresh allowance', title: 'Codex 5-hour usage reset early', accent: 'codex',
    });
    expect(reset?.detail).toContain('Back down to 8%');
  });

  it('keeps a reset event after the recorded five-hour deadline without calling it early', () => {
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 8, resetsAt: '2026-07-20T20:15:00.000Z' },
      history: [
        {
          at: '2026-07-20T10:00:00.000Z', fiveHourUsedPercent: 82,
          fiveHourResetsAt: '2026-07-20T15:00:00.000Z',
        },
        {
          at: '2026-07-20T15:15:00.000Z', fiveHourUsedPercent: 8,
          fiveHourResetsAt: '2026-07-20T20:15:00.000Z',
        },
      ],
    };

    const reset = aiCandidates([{ id: 'codex', label: 'Codex', data }], 7, 50)
      .find((candidate) => candidate.id === 'ai-usage:five-hour-reset:codex');

    expect(reset).toMatchObject({ title: 'Codex 5-hour usage just reset' });
  });

  it('treats any observed five-hour zero after positive use as a reset event', () => {
    const data: AiUsageToolData = {
      available: true,
      fiveHour: { usedPercent: 0, resetsAt: '2026-07-20T20:15:00.000Z' },
      history: [
        { at: '2026-07-20T10:00:00.000Z', fiveHourUsedPercent: 12 },
        { at: '2026-07-20T10:15:00.000Z', fiveHourUsedPercent: 0 },
      ],
    };

    const reset = aiCandidates([{ id: 'codex', label: 'Codex', data }], 7, 50)
      .find((candidate) => candidate.id === 'ai-usage:five-hour-reset:codex');

    expect(reset).toMatchObject({
      kicker: 'Fresh allowance', title: 'Codex 5-hour usage just reset', accent: 'codex',
    });
  });

  it('marks a weekly allowance reset before its recorded deadline as an early command-center event', () => {
    const data: AiUsageToolData = {
      available: true,
      weekly: { usedPercent: 6, resetsAt: '2026-07-27T10:15:00.000Z' },
      history: [
        {
          at: '2026-07-20T10:00:00.000Z', weeklyUsedPercent: 86,
          weeklyResetsAt: '2026-07-27T10:00:00.000Z',
        },
        {
          at: '2026-07-20T10:15:00.000Z', weeklyUsedPercent: 6,
          weeklyResetsAt: '2026-07-27T10:15:00.000Z',
        },
      ],
    };

    const reset = aiCandidates([{ id: 'claude', label: 'Claude', data }], 7, 50)
      .find((candidate) => candidate.id === 'ai-usage:reset:claude');

    expect(reset).toMatchObject({
      kicker: 'Fresh allowance', title: 'Claude usage reset early', accent: 'claude',
    });
    expect(reset?.detail).toContain('Back down to 6%');
  });
});
