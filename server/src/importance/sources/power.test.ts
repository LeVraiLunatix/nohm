import { describe, expect, it } from 'vitest';
import type { PowerData } from '@nohm/shared';
import { powerCandidates } from './power.js';

describe('powerCandidates', () => {
  const now = Date.parse('2026-07-18T18:30:00+02:00');
  const hour = (isoHour: string, price: number): PowerData['today'][number] => ({
    time: `2026-07-18T${isoHour}:00:00+02:00`, hourLabel: isoHour, priceNokPerKwh: price,
  });
  const flatDay = (price: number): PowerData => ({
    area: 'NO3',
    today: Array.from({ length: 24 }, (_, index) => hour(String(index).padStart(2, '0'), price)),
    tomorrow: [],
  });

  it('emits only the ambient tile on an ordinary flat day', () => {
    const candidates = powerCandidates(flatDay(0.85), 1.5, 1, now);

    expect(candidates).toEqual([expect.objectContaining({
      id: expect.stringContaining('power:now'), kicker: 'Power · NO3', title: '0.85 kr/kWh', shapes: ['tile'],
    })]);
  });

  it('flags a spike above the ratio and the floor, pointing at the cheapest upcoming hour', () => {
    const data = flatDay(0.8);
    data.today[18] = hour('18', 2.4);
    data.today[23] = hour('23', 0.4);
    const spike = powerCandidates(data, 1.5, 1, now).find((candidate) => candidate.id.startsWith('power:spike'));

    expect(spike).toMatchObject({
      title: '2.40 kr/kWh right now',
      detail: expect.stringContaining('down to 0.40 kr at 23:00'),
      shapes: ['secondary', 'tile'],
    });
  });

  it('stays quiet on cheap days below the NOK floor — no spike, no cheap-ahead nudge', () => {
    const data = flatDay(0.1);
    data.today[18] = hour('18', 0.4);

    expect(powerCandidates(data, 1.5, 1, now).map((candidate) => candidate.id))
      .toEqual([expect.stringContaining('power:now')]);
  });

  it('points at a much cheaper upcoming hour', () => {
    const data = flatDay(1.2);
    data.today[22] = hour('22', 0.5);
    const cheap = powerCandidates(data, 1.5, 1, now).find((candidate) => candidate.id.startsWith('power:cheap-ahead'));

    expect(cheap).toMatchObject({ title: '0.50 kr at 22:00', shapes: ['tile'] });
  });

  it('celebrates a negative price', () => {
    const data = flatDay(0.5);
    data.today[18] = hour('18', -0.12);

    expect(powerCandidates(data, 1.5, 1, now)[0]).toMatchObject({
      kicker: 'Negative power price', title: 'You get paid to use power',
    });
  });
});
