/**
 * Top 25 Rankings — full AP Top 25 list from ESPN.
 * Each row: rank, team name (link to team page), conference, tier badge.
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

export default function Top25Rankings() {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRankings()
      .then((data) => setRankings(data?.rankings || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const getSlug = (teamName) => {
    return getTeamSlug(teamName) ?? getSlugFromRankingsName(teamName, TEAMS);
  };

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Top 25 Rankings</h2>
        <SourceBadge source="ESPN" />
      </div>

      {loading && (
        <div className={styles.loading}>Loading…</div>
      )}

      {error && (
        <div className={styles.error}>Rankings unavailable</div>
      )}

      {!loading && !error && rankings.length > 0 && (
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
