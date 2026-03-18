/**
 * Top 25 Rankings — full AP Top 25 list from ESPN.
 * Collapsible: expanded on desktop, collapsed on mobile by default.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getTeamSlug } from '../../utils/teamSlug';
import { getSlugFromRankingsName } from '../../utils/rankingsNormalize';
import { getTeamBySlug } from '../../data/teams';
import { TEAMS } from '../../data/teams';
import SourceBadge from '../shared/SourceBadge';
import TeamLogo from '../shared/TeamLogo';
import SeedBadge from '../common/SeedBadge';
import { getTeamSeed, isBracketOfficial } from '../../utils/tournamentHelpers';
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

export default function Top25Rankings({ rankings: rankingsProp }) {
  const [rankings, setRankings] = useState(rankingsProp ?? []);
  const [loading, setLoading] = useState(!rankingsProp);
  const [error, setError] = useState(null);
  const isMobile = useMediaQuery(MOBILE_MQ);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(!isMobile);
  }, [isMobile]);

  useEffect(() => {
    if (Array.isArray(rankingsProp)) {
      setRankings(rankingsProp);
      setLoading(false);
    }
  }, [rankingsProp]);

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

      {!loading && !error && rankings.length > 0 && isExpanded && (() => {
        const bracketOfficial = isBracketOfficial();
        return (
          <div className={styles.table}>
            <div className={`${styles.row} ${styles.rowHeader}`}>
              <span className={styles.colRank}>#</span>
              <span className={styles.colTeam}>Team</span>
              <span className={styles.colConf}>Conference</span>
              {bracketOfficial
                ? <span className={styles.colTier}>Seed</span>
                : <span className={styles.colTier}>Tier</span>
              }
            </div>
            {rankings.map((r) => {
              const slug = getSlug(r.teamName);
              const team = slug ? getTeamBySlug(slug) : null;
              const teamForLogo = team || (slug ? { slug, name: r.teamName, logo: `/logos/${slug}.svg` } : null);
              const linkTo = slug ? `/teams/${slug}` : '/teams';
              const seed = getTeamSeed(slug || r.teamName);

              return (
                <Link
                  key={r.rank}
                  to={linkTo}
                  className={`${styles.row} ${styles.rowLink}`}
                >
                  <span className={styles.colRank}>{r.rank}</span>
                  <span className={styles.colTeam}>
                    {teamForLogo && (
                      <span className={styles.colLogo}>
                        <TeamLogo team={teamForLogo} size={24} />
                      </span>
                    )}
                    <span className={styles.teamName}>{r.teamName}</span>
                  </span>
                  <span className={styles.colConf}>
                    {team?.conference ?? '—'}
                  </span>
                  <span className={styles.colTier}>
                    {bracketOfficial ? (
                      seed != null
                        ? <SeedBadge seed={seed} size="sm" teamSlug={slug} />
                        : <span className={styles.tierNa}>—</span>
                    ) : (
                      team?.oddsTier ? (
                        <span className={`${styles.tier} ${TIER_CLASS[team.oddsTier] || ''}`}>
                          {team.oddsTier}
                        </span>
                      ) : (
                        <span className={styles.tierNa}>—</span>
                      )
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        );
      })()}

      {!loading && !error && rankings.length === 0 && (
        <div className={styles.empty}>No rankings available</div>
      )}
    </section>
  );
}
