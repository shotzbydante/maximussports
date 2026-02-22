/**
 * Single matchup row: teams (linked), score, status, time (PST), network.
 * Team names link to /teams/<slug> when slug is known.
 */

import { Link } from 'react-router-dom';
import { getTeamSlug } from '../../utils/teamSlug';
import SourceBadge from '../shared/SourceBadge';
import styles from './MatchupRow.module.css';

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

export default function MatchupRow({ game, source = 'ESPN' }) {
  const { homeTeam, awayTeam, homeScore, awayScore, gameStatus, startTime, network } = game;
  const homeSlug = getTeamSlug(homeTeam);
  const awaySlug = getTeamSlug(awayTeam);
  const live = isLive(gameStatus);

  const TeamLink = ({ name, slug }) =>
    slug ? (
      <Link to={`/teams/${slug}`} className={styles.link}>
        {name}
      </Link>
    ) : (
      <span>{name}</span>
    );

  return (
    <div className={`${styles.row} ${live ? styles.rowLive : ''}`}>
      <span className={styles.matchup}>
        <TeamLink name={awayTeam} slug={awaySlug} />
        <span className={styles.at}> @ </span>
        <TeamLink name={homeTeam} slug={homeSlug} />
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
