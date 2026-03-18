/**
 * Single matchup row: teams (linked, with tier badges), score, status, time (PST), network.
 */

import { Link } from 'react-router-dom';
import { getTeamSlug, getOddsTier } from '../../utils/teamSlug';
import { ESPNGamecastLink } from '../shared/ESPNGamecastLink';
import SourceBadge from '../shared/SourceBadge';
import TeamLogo from '../shared/TeamLogo';
import StatusChip from '../shared/StatusChip';
import SeedBadge from '../common/SeedBadge';
import { getTeamSeed, isBracketOfficial } from '../../utils/tournamentHelpers';
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

function isFinal(status) {
  const s = (status || '').toLowerCase();
  return s === 'final' || s.includes('final');
}

function TierBadge({ tier }) {
  if (!tier) return <span className={styles.tierNa}>N/A</span>;
  return (
    <span className={`${styles.tierBadge} ${TIER_CLASS[tier] || ''}`}>
      {tier}
    </span>
  );
}

export default function MatchupRow({ game, rankMap = {} }) {
  const { homeTeam, awayTeam, homeScore, awayScore, gameStatus, startTime, network } = game;
  const homeSlug = getTeamSlug(homeTeam);
  const awaySlug = getTeamSlug(awayTeam);
  const homeTier = getOddsTier(homeTeam);
  const awayTier = getOddsTier(awayTeam);
  const homeRank = homeSlug ? rankMap[homeSlug] : null;
  const awayRank = awaySlug ? rankMap[awaySlug] : null;
  const live = isLive(gameStatus);

  const bracketIsOfficial = isBracketOfficial();

  const TeamCell = ({ name, slug, tier, rank }) => {
    const seed = getTeamSeed(slug || name);
    const showSeed = seed != null;
    const showRank = !bracketIsOfficial && rank != null && !showSeed;
    const showTier = !bracketIsOfficial;
    return (
      <span className={styles.teamCell}>
        {showSeed && <SeedBadge seed={seed} size="sm" teamSlug={slug} />}
        <span className={styles.teamLogoWrap}>
          <TeamLogo team={{ slug, name }} size={18} />
        </span>
        {showRank && <span className={styles.rank}>#{rank}</span>}
        {slug ? (
          <Link to={`/teams/${slug}`} className={styles.link}>
            {name}
          </Link>
        ) : (
          <span>{name}</span>
        )}
        {showTier && <TierBadge tier={tier} />}
      </span>
    );
  };

  return (
    <div className={`${styles.row} ${live ? styles.rowLive : ''}`}>
      <span className={styles.matchup}>
        <TeamCell name={awayTeam} slug={awaySlug} tier={awayTier} rank={awayRank} />
        <span className={styles.at}> @ </span>
        <TeamCell name={homeTeam} slug={homeSlug} tier={homeTier} rank={homeRank} />
      </span>
      <span className={styles.score}>
        <span>{awayScore != null && homeScore != null ? `${awayScore} – ${homeScore}` : '—'}</span>
        {isFinal(gameStatus) && awayScore != null && (
          <span className={styles.finalLabel}>Final</span>
        )}
      </span>
      <span className={styles.status}>
        <StatusChip status={gameStatus} />
      </span>
      <span className={styles.time}>{formatTimePST(startTime)}</span>
      <span className={styles.network}>
        {network ? <SourceBadge source={network} /> : '—'}
      </span>
      <ESPNGamecastLink game={game} />
    </div>
  );
}
