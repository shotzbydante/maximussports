/**
 * Single matchup row: teams (linked, with tier badges), score, status, time (PST), network.
 */

import { Link } from 'react-router-dom';
import { getTeamSlug, getOddsTier } from '../../utils/teamSlug';
import SourceBadge from '../shared/SourceBadge';
import styles from './MatchupRow.module.css';

const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};

function formatTimePST(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }) + ' PST';
  } catch {
    return '—';
  }
}

function isLive(status) {
  const s = (status || '').toLowerCase();
  return (
    s.startsWith('q1 ') ||
    s.startsWith('q2 ') ||
    s.startsWith('1st ') ||
    s.startsWith('2nd ') ||
    s === 'halftime' ||
    (s.includes(':') && !s.toLowerCase().includes('am') && !s.toLowerCase().includes('pm'))
  );
}

function TierBadge({ tier }) {
  if (!tier) return <span className={styles.tierNa}>N/A</span>;
  return (
    <span className={`${styles.tierBadge} ${TIER_CLASS[tier] || ''}`}>
      {tier}
    </span>
  );
}

export default function MatchupRow({ game, source = 'ESPN', rankMap = {} }) {
  const { homeTeam, awayTeam, homeScore, awayScore, gameStatus, startTime, network } = game;
  const homeSlug = getTeamSlug(homeTeam);
  const awaySlug = getTeamSlug(awayTeam);
  const homeTier = getOddsTier(homeTeam);
  const awayTier = getOddsTier(awayTeam);
  const homeRank = homeSlug ? rankMap[homeSlug] : null;
  const awayRank = awaySlug ? rankMap[awaySlug] : null;
  const live = isLive(gameStatus);

  const TeamCell = ({ name, slug, tier, rank }) => (
    <span className={styles.teamCell}>
      {rank != null && <span className={styles.rank}>#{rank}</span>}
      {slug ? (
        <Link to={`/teams/${slug}`} className={styles.link}>
          {name}
        </Link>
      ) : (
        <span>{name}</span>
      )}
      <TierBadge tier={tier} />
    </span>
  );

  return (
    <div className={`${styles.row} ${live ? styles.rowLive : ''}`}>
      <span className={styles.matchup}>
        <TeamCell name={awayTeam} slug={awaySlug} tier={awayTier} rank={awayRank} />
        <span className={styles.at}> @ </span>
        <TeamCell name={homeTeam} slug={homeSlug} tier={homeTier} rank={homeRank} />
      </span>
      <span className={styles.score}>
        {awayScore != null && homeScore != null ? (
          `${awayScore} – ${homeScore}`
        ) : (
          '—'
        )}
      </span>
      <span className={styles.status}>
        <span className={live ? styles.statusLive : ''}>{gameStatus}</span>
        {live && <span className={styles.dot} />}
      </span>
      <span className={styles.time}>{formatTimePST(startTime)}</span>
      <span className={styles.network}>{network || '—'}</span>
      <span className={styles.badge}>
        <SourceBadge source={source} />
      </span>
    </div>
  );
}
