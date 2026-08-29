import { useState } from 'react';
import { isValorantWinRateEligibleMode, type ValorantData, type ValorantMatch } from '@nohm/shared';
import { relativeTime } from '../lib/time';

export const RESULT_LABELS: Record<ValorantMatch['result'], string> = {
  win: 'Victory',
  loss: 'Defeat',
  draw: 'Draw',
};
const STREAK_RESULT_LABELS: Record<ValorantMatch['result'], string> = {
  win: 'W',
  loss: 'L',
  draw: 'D',
};

export function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}

export function kda(match: ValorantMatch): string {
  return `${match.kills}/${match.deaths}/${match.assists}`;
}

export function headshotRate(match: ValorantMatch): number {
  const totalShots = match.headshots + match.bodyshots + match.legshots;
  return totalShots === 0 ? 0 : Math.round((match.headshots / totalShots) * 100);
}

export function formatMatchDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

export function recentRecord(matches: ValorantMatch[]) {
  return matches.reduce((record, match) => {
    if (match.result === 'win') record.wins += 1;
    else if (match.result === 'loss') record.losses += 1;
    else record.draws += 1;
    return record;
  }, { wins: 0, losses: 0, draws: 0 });
}

export function winRateMatches(matches: ValorantMatch[]): ValorantMatch[] {
  return matches.filter((match) => isValorantWinRateEligibleMode(match.mode));
}

export function currentStreak(matches: ValorantMatch[]): { result: ValorantMatch['result']; length: number } | undefined {
  const latest = matches[0];
  if (!latest) return undefined;
  let length = 0;
  for (const match of matches) {
    if (match.result !== latest.result) break;
    length += 1;
  }
  return { result: latest.result, length };
}

/** Ranked games are the meaningful "recent form" signal, but a fresh account or an off week can
 * leave fewer than `count` of them among the last fetch — pad with whatever else is recent so the
 * hero never shows an empty slot, then restore chronological order for display. */
export function recentSpotlightMatches(matches: ValorantMatch[], count: number): ValorantMatch[] {
  const ranked = matches.filter((match) => match.mode === 'Competitive').slice(0, count);
  if (ranked.length >= count) return ranked;
  const rankedIds = new Set(ranked.map((match) => match.matchId));
  const filler = matches.filter((match) => !rankedIds.has(match.matchId));
  return [...ranked, ...filler]
    .slice(0, count)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

function streakModifier(result: ValorantMatch['result'] | undefined): string {
  if (result === 'win') return ' is-up';
  if (result === 'loss') return ' is-down';
  return '';
}

export function averageCombatScore(matches: ValorantMatch[]): number | undefined {
  const totalRounds = matches.reduce((total, match) => total + (match.roundsWon ?? 0) + (match.roundsLost ?? 0), 0);
  if (totalRounds === 0) return undefined;
  return Math.round(matches.reduce((total, match) => total + match.score, 0) / totalRounds);
}

export function killDeathRatio(matches: ValorantMatch[]): number | undefined {
  if (matches.length === 0) return undefined;
  const kills = matches.reduce((total, match) => total + match.kills, 0);
  const deaths = matches.reduce((total, match) => total + match.deaths, 0);
  if (deaths === 0) return undefined;
  return Math.round((kills / deaths) * 100) / 100;
}

export function aggregateHeadshotRate(matches: ValorantMatch[]): number | undefined {
  const totalShots = matches.reduce((total, match) => total + match.headshots + match.bodyshots + match.legshots, 0);
  if (totalShots === 0) return undefined;
  const headshots = matches.reduce((total, match) => total + match.headshots, 0);
  return Math.round((headshots / totalShots) * 100);
}

export function actLabel(short: string): string {
  const match = /^e(\d+)a(\d+)$/i.exec(short);
  return match ? `E${match[1]} · A${match[2]}` : short.toUpperCase();
}

interface ValorantPeriod {
  id: string;
  label: string;
  matches: ValorantMatch[];
}

export function performancePeriods(data: ValorantData): ValorantPeriod[] {
  const { history } = data;
  const now = Date.now();
  const twoWeekMatches = history.matches.filter((match) => Date.parse(match.startedAt) >= now - 14 * 24 * 60 * 60_000);
  const actCodes = [...new Set(history.matches.map((match) => match.actShort).filter((act): act is string => Boolean(act)))];

  return [
    { id: 'two-weeks', label: '2 weeks', matches: twoWeekMatches },
    ...(history.currentActShort ? [{ id: `act:${history.currentActShort}`, label: 'Current act', matches: history.matches.filter((match) => match.actShort === history.currentActShort) }] : []),
    ...actCodes
      .filter((act) => act !== history.currentActShort)
      .map((act) => ({ id: `act:${act}`, label: actLabel(act), matches: history.matches.filter((match) => match.actShort === act) })),
    { id: 'career', label: 'Career', matches: history.matches },
  ].filter((period) => period.id === 'career' || period.matches.length > 0);
}

export interface ValorantModeOption {
  id: string;
  label: string;
  matches: ValorantMatch[];
}

/** Sorted by frequency (most-played mode first) rather than alphabetically, so Competitive/Unrated
 * naturally lead for most accounts without hardcoding a priority list of Riot's queue names.
 * Grouped case-insensitively — HenrikDev has been observed returning both "Unknown" and "unknown"
 * for the same underlying queue, which would otherwise split into two near-identical tabs. */
export function modeOptions(matches: ValorantMatch[]): ValorantModeOption[] {
  const byMode = new Map<string, { mode: string; matches: ValorantMatch[] }>();
  for (const match of matches) {
    const key = match.mode.toLowerCase();
    const bucket = byMode.get(key);
    if (!bucket) {
      byMode.set(key, { mode: match.mode, matches: [match] });
      continue;
    }
    bucket.matches.push(match);
    if (bucket.mode === key && match.mode !== key) bucket.mode = match.mode;
  }
  return [
    { id: 'all', label: 'All modes', matches },
    ...[...byMode.values()].sort((a, b) => b.matches.length - a.matches.length).map(({ mode, matches: modeMatches }) => ({ id: mode, label: mode, matches: modeMatches })),
  ];
}

export interface AgentSummary {
  name: string;
  iconUrl?: string;
  matches: ValorantMatch[];
}

export function agentSummaries(matches: ValorantMatch[]): AgentSummary[] {
  const agents = new Map<string, AgentSummary>();
  // A blank agentName marks a sparse, stats-free match backfilled from Riot's data-export archive
  // (see server/scripts/backfillValorantHistory.ts) — it has no agent to attribute, so it must not
  // dominate the pool ranking the way thousands of them would if grouped under one bucket.
  for (const match of matches.filter((match) => match.agentName !== '')) {
    const summary = agents.get(match.agentName) ?? { name: match.agentName, iconUrl: match.agentIconUrl, matches: [] };
    summary.matches.push(match);
    agents.set(match.agentName, summary);
  }
  return [...agents.values()].sort((a, b) => b.matches.length - a.matches.length || b.matches.filter((match) => match.result === 'win').length - a.matches.filter((match) => match.result === 'win').length);
}

export function Stat({ value, label, detail }: Readonly<{ value: string | number; label: string; detail?: string }>) {
  return (
    <div className="valorant-stat">
      <p className="valorant-stat-value">{value}</p>
      <p className="valorant-stat-label">{label}</p>
      {detail && <p className="valorant-stat-detail">{detail}</p>}
    </div>
  );
}

export function ValorantProfile({ data, compact = false }: Readonly<{ data: ValorantData; compact?: boolean }>) {
  const { profile, rank } = data;
  return (
    <section className={`valorant-profile${compact ? ' valorant-profile--compact' : ''}`}>
      {profile.cardIconUrl && (
        <img src={profile.cardIconUrl} alt="" aria-hidden className="valorant-card-art" loading="lazy" decoding="async" />
      )}
      <div className="valorant-profile-main">
        <div className="valorant-profile-kicker">
          <span>{profile.region.toUpperCase()}</span>
        </div>
        <h2 className="valorant-profile-name">{profile.name}</h2>
        <p className="valorant-profile-tag">#{profile.tag}</p>
      </div>
      <div className="valorant-rank-panel">
        {rank.tierIconUrl && <img src={rank.tierIconUrl} alt="" aria-hidden className="valorant-rank-icon" loading="lazy" decoding="async" />}
        <div>
          <p className="valorant-rank-name">{rank.tierName}</p>
          <p className="valorant-rank-rr">{rank.rr} RR{rank.leaderboardRank ? ` · #${formatNumber(rank.leaderboardRank)}` : ''}</p>
        </div>
      </div>
      <div className="valorant-level-badge" aria-label={`Account level ${profile.accountLevel}`}>
        <span>Level</span>
        <strong>{profile.accountLevel}</strong>
      </div>
    </section>
  );
}

export function ValorantStats({ data }: Readonly<{ data: ValorantData }>) {
  const recentRateMatches = winRateMatches(data.recentMatches);
  const record = recentRecord(recentRateMatches);
  const recordSummary = recentRateMatches.length === 0 ? '—' : [record.wins, record.losses, record.draws || undefined].filter((v): v is number => v !== undefined).join('–');
  const seasonWinRate = data.currentSeason && data.currentSeason.games > 0 ? Math.round((data.currentSeason.wins / data.currentSeason.games) * 100) : undefined;
  return (
    <div className="valorant-stats-grid">
      <Stat value={data.peak.tierName} label="peak rank" detail={data.peak.seasonShort ? `Season ${actLabel(data.peak.seasonShort)}` : undefined} />
      <Stat
        value={seasonWinRate !== undefined ? `${seasonWinRate}%` : '—'}
        label="season win rate"
        detail={data.currentSeason ? `${formatNumber(data.currentSeason.wins)}/${formatNumber(data.currentSeason.games)} games` : undefined}
      />
      <Stat value={recordSummary} label="last matches" />
    </div>
  );
}

/** A period selector deliberately works on the server-provided archive so switching scope is
 * instantaneous and never causes the browser to call HenrikDev or expose its API key. */
export function ValorantPerformance({ data, selectedPeriodId, onPeriodChange, selectedModeId, onModeChange }: Readonly<{
  data: ValorantData;
  selectedPeriodId?: string;
  onPeriodChange?: (periodId: string) => void;
  selectedModeId?: string;
  onModeChange?: (modeId: string) => void;
}>) {
  const { history } = data;
  const periodOptions = performancePeriods(data);
  const [uncontrolledPeriodId, setUncontrolledPeriodId] = useState('two-weeks');
  const activePeriodId = selectedPeriodId ?? uncontrolledPeriodId;
  const selectedPeriod = periodOptions.find((period) => period.id === activePeriodId) ?? periodOptions[0];

  const modeOpts = modeOptions(selectedPeriod?.matches ?? []);
  const [uncontrolledModeId, setUncontrolledModeId] = useState('all');
  const requestedModeId = selectedModeId ?? uncontrolledModeId;
  const activeModeId = modeOpts.some((mode) => mode.id === requestedModeId) ? requestedModeId : 'all';
  const selectedMode = modeOpts.find((mode) => mode.id === activeModeId) ?? modeOpts[0];
  if (!selectedPeriod || !selectedMode) return null;

  const selectPeriod = (periodId: string) => {
    if (onPeriodChange) onPeriodChange(periodId);
    else setUncontrolledPeriodId(periodId);
  };
  const selectMode = (modeId: string) => {
    if (onModeChange) onModeChange(modeId);
    else setUncontrolledModeId(modeId);
  };

  const matches = selectedMode.matches;
  const eligibleMatches = winRateMatches(matches);
  const record = recentRecord(eligibleMatches);
  const winRate = eligibleMatches.length === 0 ? undefined : Math.round((record.wins / eligibleMatches.length) * 100);
  const acs = averageCombatScore(matches);
  const agents = agentSummaries(matches).slice(0, 5);
  const loadedCount = history.matches.length;
  const coverage = `${formatNumber(Math.max(loadedCount, history.totalMatchesAvailable))} matches captured`;
  const recordDetail = eligibleMatches.length === 0 ? undefined : [`${eligibleMatches.length} counted`, `${record.wins}W`, `${record.losses}L`, record.draws > 0 ? `${record.draws}D` : undefined]
    .filter((value): value is string => value !== undefined)
    .join(' · ');

  return (
    <section className="valorant-performance">
      <div className="valorant-performance-heading">
        <div>
          <p className="valorant-eyebrow">Performance</p>
          <h3>Agent pool</h3>
        </div>
        <p>{coverage}</p>
      </div>
      <div className="valorant-performance-filters" aria-label="Agent pool filters">
        <label>
          <span>Matches</span>
          <select value={selectedPeriod.id} onChange={(event) => selectPeriod(event.target.value)}>
            {periodOptions.map((period) => <option key={period.id} value={period.id}>{period.label}</option>)}
          </select>
        </label>
        {modeOpts.length > 2 && (
          <label>
            <span>Game mode</span>
            <select value={selectedMode.id} onChange={(event) => selectMode(event.target.value)}>
              {modeOpts.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
            </select>
          </label>
        )}
      </div>
      {matches.length === 0 ? (
        <p className="text-sm text-ink-faint">No matches are available for this period yet.</p>
      ) : (
        <>
          <div className="valorant-performance-stats">
            <Stat value={matches.length} label="matches" />
            <Stat value={winRate === undefined ? '—' : `${winRate}%`} label="win rate" detail={recordDetail} />
            <Stat value={acs ?? '—'} label="average ACS" />
          </div>
          <ol className="valorant-agent-pool">
            {agents.map((agent) => {
              const eligibleAgentMatches = winRateMatches(agent.matches);
              const agentRecord = recentRecord(eligibleAgentMatches);
              const agentWinRate = eligibleAgentMatches.length === 0
                ? undefined
                : Math.round((agentRecord.wins / eligibleAgentMatches.length) * 100);
              return (
                <li key={agent.name}>
                  {agent.iconUrl && <img src={agent.iconUrl} alt="" aria-hidden loading="lazy" decoding="async" />}
                  <div>
                    <p>{agent.name}</p>
                    <span>{agent.matches.length} matches · {agentWinRate === undefined ? '—' : `${agentWinRate}%`} win rate</span>
                  </div>
                  <strong>{averageCombatScore(agent.matches) ?? '—'} <small>ACS</small></strong>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <p className="valorant-history-note">Career expands from HenrikDev&apos;s paginated history and is not a guaranteed complete Riot match record.</p>
    </section>
  );
}

export function ValorantMatchPulse({ data }: Readonly<{ data: ValorantData }>) {
  const matches = winRateMatches(data.recentMatches);
  if (matches.length === 0) return <p className="text-sm text-ink-faint">Play a team mode to start a fresh form readout.</p>;
  const record = recentRecord(matches);
  const streak = currentStreak(matches);
  let streakLabel = 'No streak yet';
  if (streak) {
    streakLabel = `${streak.length}${STREAK_RESULT_LABELS[streak.result]} streak`;
  }
  return (
    <div className="valorant-match-pulse">
      <div className="valorant-match-pulse-record">
        <p className="valorant-eyebrow">Recent form</p>
        <p><strong>{record.wins}</strong> wins <span>·</span> <strong>{record.losses}</strong> losses{record.draws > 0 && <><span>·</span> <strong>{record.draws}</strong> draws</>}</p>
      </div>
      <div className="valorant-match-pulse-trend">
        <span className={`valorant-streak-badge${streakModifier(streak?.result)}`}>{streakLabel}</span>
      </div>
      <ol className="valorant-form-strip" aria-label="Results of recent matches">
        {matches.slice(0, 10).reverse().map((match, index) => <li key={`${match.matchId}-${index}`} data-result={match.result}>{match.result.charAt(0).toUpperCase()}</li>)}
      </ol>
    </div>
  );
}

export function ValorantMatchLog({ data, selectedPeriodId, selectedModeId, onModeChange }: Readonly<{
  data: ValorantData;
  selectedPeriodId?: string;
  selectedModeId?: string;
  onModeChange?: (modeId: string) => void;
}>) {
  const periodOptions = performancePeriods(data);
  const selectedPeriod = periodOptions.find((period) => period.id === selectedPeriodId) ?? periodOptions[0];
  const periodMatches = selectedPeriod?.matches ?? [];

  const modeOpts = modeOptions(periodMatches);
  const [uncontrolledModeId, setUncontrolledModeId] = useState('all');
  const requestedModeId = selectedModeId ?? uncontrolledModeId;
  const activeModeId = modeOpts.some((mode) => mode.id === requestedModeId) ? requestedModeId : 'all';
  const selectedMode = modeOpts.find((mode) => mode.id === activeModeId) ?? modeOpts[0];
  const selectMode = (modeId: string) => {
    if (onModeChange) onModeChange(modeId);
    else setUncontrolledModeId(modeId);
  };
  const matches = selectedMode?.matches ?? [];

  if (periodMatches.length === 0) return <p className="text-sm text-ink-faint">No matches captured yet.</p>;

  return (
    <section className="valorant-match-history" aria-live="polite">
      {modeOpts.length > 2 && (
        <div className="valorant-periods" role="tablist" aria-label="Valorant game mode">
          {modeOpts.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={mode.id === activeModeId}
              className={mode.id === activeModeId ? 'is-selected' : undefined}
              onClick={() => selectMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      )}
      <p className="valorant-match-history-summary">{selectedPeriod?.label} · {matches.length} {matches.length === 1 ? 'match' : 'matches'}</p>
      {matches.length === 0 ? (
        <p className="text-sm text-ink-faint">No matches for this mode yet.</p>
      ) : (
        <ol className="valorant-match-log">
          {matches.map((match, index) => {
            const hasCombatStats = match.agentName !== '';
            return (
              <li key={`${match.matchId}-${index}`} className="valorant-match-row" data-result={match.result}>
                {match.agentIconUrl && <img src={match.agentIconUrl} alt={match.agentName} className="valorant-agent-icon" loading="lazy" decoding="async" />}
                <div className="valorant-match-main">
                  <div className="valorant-match-title-row">
                    <p>{match.map}{match.roundsWon !== undefined && match.roundsLost !== undefined ? ` · ${match.roundsWon}-${match.roundsLost}` : ''}</p>
                    <time dateTime={match.startedAt}>{relativeTime(match.startedAt)}</time>
                  </div>
                  <div className="valorant-match-meta">
                    <span>{match.mode}</span>
                    <span>{RESULT_LABELS[match.result]}</span>
                    {match.durationSeconds !== undefined && <span>{formatMatchDuration(match.durationSeconds)}</span>}
                    {hasCombatStats && <span>{kda(match)} KDA</span>}
                    {hasCombatStats && <span>{headshotRate(match)}% HS</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
