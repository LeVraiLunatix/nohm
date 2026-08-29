import type { CommandCenterSlot } from '@nohm/shared';

export type SlotShape = 'hero' | 'secondary' | 'tile';

export interface Candidate extends CommandCenterSlot {
  shapes: SlotShape[];
}

/** Steam "moments" that need cross-poll history to detect — computed once in commandCenter.ts
 * (via SignalHistoryStore) and passed into the otherwise-pure steamCandidates(). */
export interface SteamMoments {
  completedGame: boolean;
  playtimeMilestoneHours?: number;
  leaderboardClimb?: { rank: number; delta: number };
}

/** Clash Royale "moments" that need cross-poll history to detect (same reasoning as SteamMoments) —
 * computed once in commandCenter.ts and passed into the otherwise-pure clashRoyaleCandidates(). */
export interface ClashRoyaleMoments {
  newArena?: string;
  newLeague?: { leagueNumber: number; trophies: number };
  newBestTrophies?: number;
}

/** SonarCloud quality gate transitions (same cross-poll-history reasoning as SteamMoments) —
 * computed once in commandCenter.ts via SignalHistoryStore and passed into sonarCandidates(). */
export interface SonarMoments {
  changed: { projectKey: string; projectName: string; status: 'passed' | 'failed' }[];
}
