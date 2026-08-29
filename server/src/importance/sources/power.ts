import type { PowerData, PowerHour } from '@nohm/shared';

import type { Candidate } from '../types.js';

const priceFmt = (price: number) => `${price.toFixed(2)} kr`;

function currentPowerHour(hours: PowerHour[], now: number): PowerHour | undefined {
  return hours.find((hour) => {
    const start = Date.parse(hour.time);
    return now >= start && now < start + 60 * 60_000;
  });
}

/**
 * Spot prices are known a day ahead, so power signals are about *acting* on the curve: a spike
 * says "put off the laundry", a much-cheaper hour ahead says when to run it. The ambient tile
 * keeps the current price on the board even when nothing is unusual.
 */
export function powerCandidates(
  data: PowerData | undefined,
  spikeRatio: number,
  spikeMinNok: number,
  now = Date.now(),
): Candidate[] {
  if (!data?.today.length) return [];
  const hours = [...data.today, ...data.tomorrow];
  const current = currentPowerHour(hours, now);
  if (!current) return [];
  const price = current.priceNokPerKwh;
  const average = data.today.reduce((sum, hour) => sum + hour.priceNokPerKwh, 0) / data.today.length;
  const upcoming = hours.filter((hour) => Date.parse(hour.time) > Date.parse(current.time)
    && Date.parse(hour.time) - now <= 12 * 60 * 60_000);
  const cheapest = upcoming.toSorted((a, b) => a.priceNokPerKwh - b.priceNokPerKwh)[0];
  const candidates: Candidate[] = [];

  if (price < 0) {
    candidates.push({
      id: `power:negative:${current.time}`, source: 'power', kind: 'power', score: 62, shapes: ['secondary', 'tile'],
      kicker: 'Negative power price', title: 'You get paid to use power',
      detail: `${priceFmt(price)}/kWh right now in ${data.area}`, href: '#/personal/power', render: { type: 'text' },
    });
  } else if (average > 0 && price >= average * spikeRatio && price >= spikeMinNok) {
    candidates.push({
      id: `power:spike:${current.time}`, source: 'power', kind: 'power', score: 60, shapes: ['secondary', 'tile'],
      kicker: 'Power price spike', title: `${priceFmt(price)}/kWh right now`,
      detail: cheapest
        ? `${(price / average).toFixed(1)}× today's average · down to ${priceFmt(cheapest.priceNokPerKwh)} at ${cheapest.hourLabel}:00`
        : `${(price / average).toFixed(1)}× today's average`,
      href: '#/personal/power', render: { type: 'text' },
    });
  } else if (cheapest && price >= spikeMinNok / 2 && cheapest.priceNokPerKwh <= price / 2) {
    // Halving an already-cheap price saves øre, not kroner — only worth a tile when the
    // current price is at least within sight of the spike floor.
    candidates.push({
      id: `power:cheap-ahead:${cheapest.time}`, source: 'power', kind: 'power', score: 30, shapes: ['tile'],
      kicker: 'Cheaper power ahead', title: `${priceFmt(cheapest.priceNokPerKwh)} at ${cheapest.hourLabel}:00`,
      detail: `vs ${priceFmt(price)}/kWh right now`, href: '#/personal/power', render: { type: 'text' },
    });
  }

  const range = [...data.today].sort((a, b) => a.priceNokPerKwh - b.priceNokPerKwh);
  candidates.push({
    id: `power:now:${current.time}`, source: 'power', kind: 'power', score: 20, shapes: ['tile'],
    kicker: `Power · ${data.area}`, title: `${priceFmt(price)}/kWh`,
    detail: `Today ${priceFmt(range[0]!.priceNokPerKwh)}–${priceFmt(range.at(-1)!.priceNokPerKwh)}`,
    href: '#/personal/power', render: { type: 'text' },
  });
  return candidates;
}
