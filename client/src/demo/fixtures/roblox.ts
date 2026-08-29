import type { RobloxData } from '@nohm/shared';
import { iso } from '@nohm/shared';

// ── Roblox ───────────────────────────────────────────────────────────────────────────────────

export function roblox(now: Date): RobloxData {
  return {
    presence: {
      status: 'in-game', gameName: 'Jailbreak', lastOnline: iso(now, 0),
      iconUrl: 'https://pbs.twimg.com/media/GClJFhnWIAAoJek.jpg',
      thumbnailUrl: 'https://pbs.twimg.com/media/GClJFhnWIAAoJek.jpg',
      playing: 214_000, visits: 42_800_000_000,
    },
    availability: 'available',
  };
}

