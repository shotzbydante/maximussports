/**
 * Live scores display — Bloomberg-style compact table.
 * Highlights in-progress games. Team names link to /teams/<slug>.
 */

import { Link } from 'react-router-dom';
import SourceBadge from '../shared/SourceBadge';
import { getTeamSlug } from '../../utils/teamSlug';
import styles from './LiveScores.module.css';

function formatStartTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
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
    (s.includes(':') && !s.includes('AM') && !s.includes('PM'))
  );
}

export default function LiveScores({ games = [], loading, error, compact = false, showTitle = true, source = 'ESPN' }) {
  const Fallback = ({ children }) => (
    <div className={styles.widget}>
      {showTitle && <h3 className={styles.title}>Live Scores</h3>}
      {children}
    </div>
  );

  if (error) {
    return (
      <Fallback>
        <p className={styles.fallback}>Live scores temporarily unavailable</p>
      </Fallback>
    );
  }

  if (loading && games.length === 0) {
    return (
      <Fallback>
        <p className={styles.fallback}>Loading scores…</p>
      </Fallback>
    );
  }

  if (games.length === 0) {
    return (
      <Fallback>
        <p className={styles.fallback}>No games scheduled</p>
      </Fallback>
    );
  }

  return (
    <div className={styles.widget}>
      {showTitle && (
        <div className={styles.widgetHeader}>
          <h3 className={styles.title}>Live Scores</h3>
          <SourceBadge source={source} />
        </div>
      )}
      <div className={`${styles.table} ${compact ? styles.tableCompact : styles.tableFull}`}>
        <div className={`${styles.row} ${styles.rowHeader}`}>
          <span className={styles.colMatchup}>Matchup</span>
          <span className={styles.colScore}>Score</span>
          <span className={styles.colStatus}>Status</span>
          {!compact && <span className={styles.colTime}>Start</span>}
        </div>
        {games.map((g) => {
          const live = isLive(g.gameStatus);
          return (
            <div
              key={g.gameId}
              className={`${styles.row} ${live ? styles.rowLive : ''}`}
            >
              <span className={styles.colMatchup}>
                {getTeamSlug(g.awayTeam) ? (
                  <Link to={`/teams/${getTeamSlug(g.awayTeam)}`} className={styles.teamLink}>{g.awayTeam}</Link>
                ) : (
                  <span>{g.awayTeam}</span>
                )}
                <span className={styles.at}> @ </span>
                {getTeamSlug(g.homeTeam) ? (
                  <Link to={`/teams/${getTeamSlug(g.homeTeam)}`} className={styles.teamLink}>{g.homeTeam}</Link>
                ) : (
                  <span>{g.homeTeam}</span>
                )}
              </span>
              <span className={styles.colScore}>
                {g.awayScore != null && g.homeScore != null ? (
                  <span className={styles.scores}>
                    {g.awayScore} – {g.homeScore}
                  </span>
                ) : (
                  <span className={styles.tbd}>—</span>
                )}
              </span>
              <span className={styles.colStatus}>
                <span className={live ? styles.statusLive : ''}>{g.gameStatus}</span>
                {live && <span className={styles.dot} />}
              </span>
              {!compact && (
                <span className={styles.colTime}>
                  {formatStartTime(g.startTime)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {loading && games.length > 0 && (
        <div className={styles.refreshing}>Updating…</div>
      )}
    </div>
  );
}
