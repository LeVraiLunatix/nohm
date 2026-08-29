import type { CommandCenterSlot } from '@nohm/shared';

/** A game's name, current mode, and session length are separate facts, so give each its own line
 * instead of squeezing two facts into the duration line. */
export function GameActivityText({ slot, className = '' }: Readonly<{ slot: CommandCenterSlot; className?: string }>) {
  if (slot.render.type !== 'minecraft-slot' && slot.render.type !== 'rocket-league-slot') return null;
  return <div className={className}>
    <p className="command-hero-title text-sm font-semibold text-ink">{slot.title}</p>
    {slot.render.activity && <p className="command-game-activity mt-1 text-sm font-medium">{slot.render.activity}</p>}
    <p className="mt-0.5 text-sm text-ink-muted">{slot.detail}</p>
  </div>;
}
