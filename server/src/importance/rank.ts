import type { CommandCenterData } from '@nohm/shared';
import type { Candidate, SlotShape } from './types.js';

const SECONDARY_CAROUSEL_LIMIT = 3;
const TILE_LIMIT = 3;

function selectSlot(
  sorted: Candidate[],
  shape: SlotShape,
  usedSources: Set<string>,
  usedIds: Set<string>,
): Candidate {
  const eligible = sorted.filter((candidate) => candidate.shapes.includes(shape));
  const selected = eligible.find((candidate) => !usedSources.has(candidate.source) && !usedIds.has(candidate.id))
    ?? eligible.find((candidate) => !usedIds.has(candidate.id))
    ?? eligible[0];
  if (!selected) throw new Error(`No ${shape} command-center fallback candidate was supplied`);
  usedSources.add(selected.source);
  usedIds.add(selected.id);
  return selected;
}

/** Highest score wins each slot; secondary keeps a short, source-diverse queue for the carousel. */
export function rankCandidates(candidates: Candidate[]): CommandCenterData {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const usedSources = new Set<string>();
  const usedIds = new Set<string>();
  let hero = selectSlot(sorted, 'hero', usedSources, usedIds);
  // No real "moment" cleared the hero bar today — rather than show the bland "nothing urgent"
  // fallback, promote the best ordinary signal (current weather, top track, etc.) into hero. Mirrors
  // the tile-promotion fallback for an empty secondary carousel below.
  if (hero.kind === 'fallback') {
    const promoted = sorted.find((candidate) => (
      candidate.kind !== 'fallback' && (candidate.shapes.includes('secondary') || candidate.shapes.includes('tile'))
    ));
    if (promoted) {
      usedSources.delete(hero.source);
      usedIds.delete(hero.id);
      hero = promoted;
      usedSources.add(hero.source);
      usedIds.add(hero.id);
    }
  }
  const secondaryCandidates = sorted.filter((candidate) => (
    candidate.id !== hero.id && candidate.kind !== 'fallback' && candidate.shapes.includes('secondary')
  ));
  const secondary = secondaryCandidates
    .filter((candidate) => !usedSources.has(candidate.source))
    .filter((candidate, index, eligible) => eligible.findIndex((other) => other.source === candidate.source) === index)
    .slice(0, SECONDARY_CAROUSEL_LIMIT);
  secondary.forEach((candidate) => {
    usedSources.add(candidate.source);
    usedIds.add(candidate.id);
  });
  if (!secondary.length) {
    const promotedTile = sorted.find((candidate) => (
      candidate.kind !== 'fallback'
      && candidate.shapes.includes('tile')
      && !usedSources.has(candidate.source)
      && !usedIds.has(candidate.id)
    ));
    if (promotedTile) {
      secondary.push(promotedTile);
      usedSources.add(promotedTile.source);
      usedIds.add(promotedTile.id);
    }
  }
  const tiles = sorted
    .filter((candidate) => candidate.kind !== 'fallback' && candidate.shapes.includes('tile'))
    .filter((candidate) => !usedSources.has(candidate.source) && !usedIds.has(candidate.id))
    .filter((candidate, index, eligible) => eligible.findIndex((other) => other.source === candidate.source) === index)
    .slice(0, TILE_LIMIT);
  return { hero, secondary, tiles };
}
