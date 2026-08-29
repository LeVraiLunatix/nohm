import { useEffect, useRef, type ReactNode } from 'react';
import { valorantMapArt, type ValorantData } from '@nohm/shared';
import { useWidget } from '../../useWidget';
import { WidgetBody } from '../../components/WidgetCard';
import { relativeTime } from '../../lib/time';
import {
  RESULT_LABELS,
  actLabel,
  aggregateHeadshotRate,
  averageCombatScore,
  formatNumber,
  headshotRate,
  kda,
  killDeathRatio,
  recentRecord,
  winRateMatches,
} from '../../widgets/ValorantWidgets';
import './valorant.css';

/* The whole overview card is one link (see SectionCard), same convention as ClashRoyaleOverview. */

const MATCH_LENGTH = 3;

export function ValorantOverview() {
  const { envelope, offline } = useWidget<ValorantData>('valorant');

  return (
    <WidgetBody envelope={envelope} offline={offline}>
      {(data) => (
        <ValorantOverviewContent data={data} />
      )}
    </WidgetBody>
  );
}

function ValorantOverviewContent({ data }: Readonly<{ data: ValorantData }>) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const { profile, rank, peak, recentMatches, history } = data;
  const cardArtUrl = profile.cardIconUrl;

  const actShort = history.currentActShort;
  const actMatches = actShort ? history.matches.filter((match) => match.actShort === actShort) : recentMatches;
  /* K/D, headshot% and ACS describe ranked form, so they average the act's competitive games only —
     unrated and deathmatch skew all three. Acts with no captured ranked game fall back to every
     match rather than showing three dashes. */
  const rankedActMatches = actMatches.filter((match) => match.mode === 'Competitive');
  const statMatches = rankedActMatches.length > 0 ? rankedActMatches : actMatches;
  // Keep every number in this card rooted in the locally captured act archive. HenrikDev's live
  // season tally is competitive-only and can otherwise disagree with the visible agent pool,
  // which intentionally includes all team modes (such as Unrated).
  const rateMatches = winRateMatches(actMatches);
  const record = recentRecord(rateMatches);
  const actWinRate = rateMatches.length > 0 ? Math.round((record.wins / rateMatches.length) * 100) : undefined;
  const actKd = killDeathRatio(statMatches);
  const actHs = aggregateHeadshotRate(statMatches);
  const actAcs = averageCombatScore(statMatches);

  /* RR is the 0–100 progress inside the current tier; Immortal+ keeps counting past it. */
  const rrPercent = Math.max(0, Math.min(100, rank.rr));

  useEffect(() => {
    const card = overviewRef.current?.closest<HTMLElement>('.dashboard-section-card--valorant');
    if (!card) return undefined;
    if (!cardArtUrl) {
      card.style.removeProperty('--valorant-card-art');
      return undefined;
    }

    const probe = new Image();
    probe.onload = () => card.style.setProperty('--valorant-card-art', `url("${cardArtUrl}")`);
    probe.src = cardArtUrl;
    return () => {
      probe.onload = null;
      card.style.removeProperty('--valorant-card-art');
    };
  }, [cardArtUrl]);

  return (
    <div ref={overviewRef} className="valorant-overview">
      <section className="valorant-overview-hero">
        {cardArtUrl && (
          <img src={cardArtUrl} alt="" aria-hidden className="valorant-overview-hero-art" loading="lazy" decoding="async" />
        )}
        <div aria-hidden className="valorant-overview-hero-scrim" />
        <div className="valorant-overview-hero-body">
          <p className="valorant-overview-kicker">
            <span>{profile.region.toUpperCase()}</span>
            <span aria-hidden>·</span>
            <span>Level {formatNumber(profile.accountLevel)}</span>
          </p>
          <h2 className="valorant-overview-name">{profile.name}<span>#{profile.tag}</span></h2>
          <div className="valorant-overview-rank">
            {rank.tierIconUrl && (
              <img src={rank.tierIconUrl} alt="" aria-hidden className="valorant-overview-rank-icon" loading="lazy" decoding="async" />
            )}
            <div className="valorant-overview-rank-body">
              <p className="valorant-overview-rank-name">
                {rank.tierName}{rank.leaderboardRank ? ` · #${formatNumber(rank.leaderboardRank)}` : ''}
              </p>
              <div className="valorant-overview-rr">
                <progress className="valorant-rr-track valorant-overview-rr-track" aria-label="Rank rating" value={rrPercent} max={100} />
                <p className="valorant-overview-rr-value">
                  {rank.rr} RR
                  {rank.lastChange !== 0 && (
                    <span className={`valorant-overview-rr-delta ${rank.lastChange > 0 ? 'is-up' : 'is-down'}`}>
                      {rank.lastChange > 0 ? '+' : ''}{rank.lastChange}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="valorant-overview-peak">
              {peak.tierIconUrl && <img src={peak.tierIconUrl} alt="" aria-hidden loading="lazy" decoding="async" />}
              <div>
                <p>Peak</p>
                <strong>{peak.tierName}</strong>
                {peak.seasonShort && <span>{actLabel(peak.seasonShort)}</span>}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="valorant-overview-act">
        <div className="valorant-overview-act-head">
          <p>Current act{actShort ? ` · ${actLabel(actShort)}` : ''}</p>
          <span>{rateMatches.length} captured</span>
        </div>
        <dl className="valorant-overview-metrics">
          <ActMetric label="Win rate" value={actWinRate === undefined ? '—' : `${actWinRate}%`} />
          <ActMetric label="K/D" value={actKd === undefined ? '—' : actKd.toFixed(2)} />
          <ActMetric label="HS %" value={actHs === undefined ? '—' : `${actHs}%`} />
          <ActMetric label="ACS" value={actAcs === undefined ? '—' : formatNumber(actAcs)} />
        </dl>
      </section>

      {recentMatches.length > 0 && (
        <section className="valorant-overview-matches">
          <div className="valorant-overview-matches-heading">
            <p>Recent matches</p>
            <span>{formatNumber(Math.max(history.matches.length, history.totalMatchesAvailable))} captured</span>
          </div>
          <ol>
            {recentMatches.slice(0, MATCH_LENGTH).map((match, index) => {
              const score = match.roundsWon !== undefined && match.roundsLost !== undefined
                ? `${match.roundsWon}–${match.roundsLost}`
                : RESULT_LABELS[match.result];
              const mapArtUrl = valorantMapArt(match.map);
              let mvpBadge: ReactNode;
              if (match.isMatchMvp) mvpBadge = <span className="valorant-overview-mvp is-match">Match MVP</span>;
              else if (match.isTeamMvp) mvpBadge = <span className="valorant-overview-mvp is-team">Team MVP</span>;
              return (
                <li key={`${match.matchId}-${index}`} data-result={match.result} data-has-art={mapArtUrl ? 'true' : undefined}>
                  {mapArtUrl && <span className="valorant-overview-match-map-art" aria-hidden style={{ backgroundImage: `url("${mapArtUrl}")` }} />}
                  {match.agentIconUrl && <img src={match.agentIconUrl} alt="" aria-hidden loading="lazy" decoding="async" />}
                  <div className="valorant-overview-match-main">
                    <div className="valorant-overview-match-title">
                      <p>{match.map}</p>
                      {mvpBadge}
                    </div>
                    <span>{match.agentName} · {match.mode} · {relativeTime(match.startedAt)}</span>
                  </div>
                  <div className="valorant-overview-match-result">
                    <strong>{score}</strong>
                    <span>{kda(match)} · {headshotRate(match)}% HS</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

function ActMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
