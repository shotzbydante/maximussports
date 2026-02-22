/**
 * Top 25 Rankings — full AP Top 25 list from ESPN.
 * Collapsible: expanded on desktop, collapsed on mobile by default.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchRankings } from '../../api/rankings';
import { getTeamSlug } from '../../utils/teamSlug';
import { getSlugFromRankingsName } from '../../utils/rankingsNormalize';
import { getTeamBySlug } from '../../data/teams';
import { TEAMS } from '../../data/teams';
import SourceBadge from '../shared/SourceBadge';
import styles from './Top25Rankings.module.css';

const TIER_CLASS = {
  Lock: styles.tierLock,
  'Should be in': styles.tierShould,
  'Work to do': styles.tierWork,
  'Long shot': styles.tierLong,
};

const MOBILE_MQ = '(max-width: 767px)';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = () => setMatches(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export default function Top25Rankings() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMobile = useMediaQuery(MOBILE_MQ);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    fetchRankings()
      .then((data) => setRankings(data?.rankings || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const getSlug = (teamName) => {
    return getTeamSlug(teamName) ?? getSlugFromRankingsName(teamName, TEAMS);
  };

  const isExpanded = expanded;

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={isExpanded}
      >
        <h2 className={styles.title}>Top 25 Rankings</h2>
        <div className={styles.headerRight}>
          <SourceBadge source="ESPN" />
          <span className={styles.chevron} aria-hidden>{isExpanded ? '▾' : '▸'}</span>
        </div>
      </button>

      {loading && (
        <div className={styles.loading}>Loading…</div>
      )}

      {error && (
        <div className={styles.error}>Rankings unavailable</div>
      )}

      {!loading && !error && rankings.length > 0 && isExpanded && (
        <div className={styles.table}>
          <div className={`${styles.row} ${styles.rowHeader}`}>
            <span className={styles.colRank}>#</span>
            <span className={styles.colTeam}>Team</span>
            <span className={styles.colConf}>Conference</span>
            <span className={styles.colTier}>Tier</span>
          </div>
          {rankings.map((r) => {
            const slug = getSlug(r.teamName);
            const team = slug ? getTeamBySlug(slug) : null;
            const linkTo = slug ? `/teams/${slug}` : '/teams';

            return (
              <div key={r.rank} className={styles.row}>
                <span className={styles.colRank}>{r.rank}</span>
                <span className={styles.colTeam}>
                  <Link to={linkTo} className={styles.teamLink}>
                    {r.teamName}
                  </Link>
                </span>
                <span className={styles.colConf}>
                  {team?.conference ?? '—'}
                </span>
                <span className={styles.colTier}>
                  {team?.oddsTier ? (
                    <span className={`${styles.tier} ${TIER_CLASS[team.oddsTier] || ''}`}>
                      {team.oddsTier}
                    </span>
                  ) : (
                    <span className={styles.tierNa}>—</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!loading && !error && rankings.length === 0 && (
        <div className={styles.empty}>No rankings available</div>
      )}
    </section>
  );
}
